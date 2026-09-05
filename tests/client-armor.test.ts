import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Multiplayer } from "../lib/multiplayer";
import { InventoryPack } from "../lib/inventory";
import { emptyEquipment } from "../lib/armor";
import { Room } from "../server/room";

function client(pack = new InventoryPack()) {
  const sent: any[] = [],
    game: any = {
      pack,
      inventory: pack.counts(),
      hotbar: pack.slots.slice(0, 9).map((s) => s?.id ?? 0),
      health: 20,
      selected: 0,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      world: { dimension: "overworld", chunks: new Map(), edits: {}, waterLevels: {} },
      adventure: {
        currentFurnace: "",
        currentChest: "",
        data: { equipment: emptyEquipment(), armor: 0, furnaces: {}, chestSlots: {}, storage: {} },
      },
      emit() {},
      notify() {},
      audio: { play() {} },
      horror: { clear() {} },
      pause(reason: string) {
        this.pauseReason = reason;
      },
      setDifficulty() {},
      dimensionChanged() {},
      ensure() {},
    };
  const net = Object.create(Multiplayer.prototype) as Multiplayer;
  Object.assign(net, {
    game,
    connected: true,
    initialized: true,
    closed: false,
    fatal: false,
    chestBusy: false,
    inventoryRevision: 0,
    inventoryQueue: [],
    furnaceOpenGeneration: 0,
    furnaceRefreshKey: null,
    furnaceRevisions: new Map(),
    chestRevisions: new Map(),
    pending: new Map(),
    applied: new Set(),
    listeners: new Set(),
    remotes: new Map(),
    token: "a".repeat(64),
    sequence: 0,
    players: [],
    sendInput() {},
    sendFaceFrame() {},
    sendProfile() {
      sent.push({ type: "profile", pack: game.pack.snapshot() });
    },
    send(data: any) {
      sent.push(structuredClone(data));
    },
  });
  game.net = net;
  const commands = () => sent.filter((m) => m.type === "command").map((m) => m.command);
  const welcome = (profile: any, health = 20) =>
    net.receive({ type: "welcome", id: "a", profile, health, clock: 90, edits: {}, water: {} });
  return { net, game, sent, commands, welcome };
}

test("Rapid pickup then armor click uses the previous authoritative ACK cursor, equipment and revision", () => {
  const pack = new InventoryPack();
  pack.slots[0] = { id: 152, n: 1 };
  const c = client(pack),
    messages: any[] = [],
    room = new Room((_id, data) => messages.push(data));
  room.join("a", "Alicja", undefined);
  const player = room.players.get("a")!;
  player.equipment.head = c.game.adventure.data.equipment.head = 149;
  player.profile.pack = pack.snapshot();
  player.profile.inventory = pack.counts();
  c.net.inventoryGesture({ type: "click", slot: { area: "slots", index: 0 } });
  c.net.armorSlot("head");
  assert.equal(c.commands().length, 1);
  room.command("a", c.commands()[0]);
  c.net.receive(messages.at(-1));
  const second = c.commands()[1];
  assert.equal(second.type, "armor");
  assert.equal(second.baseRevision, 1);
  assert.deepEqual(second.expectedCursor, { id: 152, n: 1 });
  assert.equal(second.expectedEquipped, 149);
  assert.deepEqual(
    c.sent.filter((m) => m.type === "profile").at(-1).pack.cursor,
    second.expectedCursor,
  );
  room.command("a", second);
  c.net.receive(messages.at(-1));
  assert.equal(c.net.inventoryRevision, 2);
  assert.equal(c.game.adventure.data.equipment.head, 152);
  assert.deepEqual(c.game.pack.cursor, { id: 149, n: 1 });
  assert.equal(c.net.chestBusy, false);
});

test("Quick equip joins the same queue and waits for the preceding inventory revision", () => {
  const pack = new InventoryPack();
  pack.slots[0] = { id: 121, n: 1 };
  const c = client(pack);
  c.net.settleInventory();
  c.net.equipArmor(121);
  assert.equal(c.commands().length, 1);
  c.net.receive({
    type: "result",
    req: c.commands()[0].req,
    ok: true,
    inventoryRevision: 4,
    pack: pack.snapshot(),
    equipment: emptyEquipment(),
  });
  assert.equal(c.commands()[1].type, "equipArmor");
  assert.equal(c.commands()[1].baseRevision, 4);
  assert.equal(c.commands()[1].id, 121);
});

test("Old equipment ACKs cannot roll back a newer pack or worn armor", () => {
  const c = client();
  c.net.inventoryRevision = 8;
  c.game.adventure.data.equipment.head = 152;
  const old = new InventoryPack();
  old.slots[0] = { id: 152, n: 1 };
  c.net.receive({
    type: "result",
    req: "older",
    ok: true,
    inventoryRevision: 7,
    pack: old.snapshot(),
    equipment: { ...emptyEquipment(), head: 149 },
  });
  assert.equal(c.game.adventure.data.equipment.head, 152);
  assert.deepEqual(c.game.pack.counts(), {});
  assert.equal(c.net.inventoryRevision, 8);
});

test("Welcome replaces armor and the pack before a replayed ACK releases the next queued armor action", () => {
  const pack = new InventoryPack();
  pack.cursor = { id: 121, n: 1 };
  const c = client(pack);
  c.net.armorSlot("chest");
  c.net.armorSlot("head");
  const first = c.commands()[0],
    restored = new InventoryPack();
  restored.cursor = { id: 152, n: 1 };
  c.welcome({
    inventoryRevision: 5,
    pack: restored.snapshot(),
    equipment: { ...emptyEquipment(), chest: 121, head: 149 },
  });
  assert.equal(c.game.adventure.data.armor, 121);
  assert.deepEqual(c.game.pack.cursor, { id: 152, n: 1 });
  assert.equal(c.commands().length, 2); // only the in-flight command was replayed
  c.net.receive({
    type: "result",
    req: first.req,
    ok: true,
    inventoryRevision: 4,
    pack: new InventoryPack().snapshot(),
    equipment: emptyEquipment(),
  });
  const next = c.commands().at(-1);
  assert.equal(next.slot, "head");
  assert.equal(next.baseRevision, 5);
  assert.deepEqual(next.expectedCursor, { id: 152, n: 1 });
  assert.equal(next.expectedEquipped, 149);
});

test("A welcome without pack resets stale inventory after an offline death", () => {
  const pack = new InventoryPack();
  pack.slots[0] = { id: 122, n: 1 };
  pack.cursor = { id: 152, n: 1 };
  const c = client(pack);
  c.game.adventure.data.equipment.chest = 122;
  c.net.connected = false;
  c.net.equipArmor(122);
  c.welcome({ inventoryRevision: 3, inventory: {}, equipment: emptyEquipment() }, 0);
  assert.deepEqual(c.game.pack.counts(), {});
  assert.deepEqual(c.game.adventure.data.equipment, emptyEquipment());
  assert.equal(c.game.adventure.data.armor, 0);
  assert.equal(c.game.pauseReason, "death");
  assert.equal(c.net.inventoryQueue.length, 0);
});

test("Death clears worn armor and unsent gear operations; a delayed ACK cannot restore them", () => {
  const c = client(),
    pack = new InventoryPack();
  pack.cursor = { id: 152, n: 1 };
  c.game.pack.restore(pack.snapshot());
  c.game.adventure.data.equipment.chest = 122;
  c.net.inventoryRevision = 3;
  c.net.armorSlot("head");
  c.net.armorSlot("chest");
  const first = c.commands()[0];
  c.net.receive({ type: "damage", health: 0, inventoryRevision: 5, reason: "horror" });
  assert.deepEqual(c.game.adventure.data.equipment, emptyEquipment());
  assert.equal(c.net.inventoryQueue.length, 0);
  c.net.receive({
    type: "result",
    req: first.req,
    ok: true,
    inventoryRevision: 4,
    equipment: { ...emptyEquipment(), head: 152, chest: 122 },
    pack: pack.snapshot(),
  });
  assert.equal(c.commands().length, 1);
  assert.deepEqual(c.game.pack.counts(), {});
  assert.deepEqual(c.game.adventure.data.equipment, emptyEquipment());
  c.net.equipArmor(121);
  c.net.armorSlot("head");
  assert.equal(c.net.inventoryQueue.length, 0);
});

test("Armor drag captures its exact source before queued ACKs and rejects a stale source without fallback", () => {
  const pack = new InventoryPack();
  pack.slots[0] = { id: 149, n: 1 };
  pack.slots[3] = { id: 149, n: 1 };
  const c = client(pack),
    source = { area: "slots" as const, index: 3 };
  c.net.settleInventory();
  c.net.equipArmor(149, source);
  source.index = 0;
  const changed = new InventoryPack();
  changed.slots[0] = { id: 149, n: 1 };
  changed.slots[9] = { id: 149, n: 1 };
  c.net.receive({
    type: "result",
    req: c.commands()[0].req,
    ok: true,
    inventoryRevision: 1,
    pack: changed.snapshot(),
    equipment: emptyEquipment(),
  });
  const drag = c.commands()[1];
  assert.deepEqual(drag.from, { area: "slots", index: 3 });
  assert.deepEqual(drag.expected, { id: 149, n: 1 });
  assert.equal(drag.baseRevision, 1);
  const messages: any[] = [],
    room = new Room((_id, data) => messages.push(data));
  room.join("a", "Alicja", undefined);
  const player = room.players.get("a")!;
  player.profile.pack = changed.snapshot();
  player.profile.inventory = changed.counts();
  player.profile.inventoryRevision = 1;
  room.command("a", drag);
  assert.equal(messages.at(-1).ok, false);
  assert.deepEqual(player.equipment, emptyEquipment());
  assert.deepEqual(player.profile.inventory, { 149: 2 });
});

test("Server armor drag swaps into the precise grid source and rejects malformed locations", () => {
  const messages: any[] = [],
    room = new Room((_id, data) => messages.push(data));
  room.join("a", "Alicja", undefined);
  const player = room.players.get("a")!,
    pack = new InventoryPack();
  pack.slots[0] = { id: 152, n: 1 };
  pack.grid[4] = { id: 152, n: 1 };
  player.equipment.head = 149;
  player.profile.pack = pack.snapshot();
  player.profile.inventory = pack.counts();
  room.command("a", {
    type: "equipArmor",
    id: 152,
    from: { area: "grid", index: 4 },
    expected: { id: 152, n: 1 },
    baseRevision: 0,
    req: "drag",
  });
  assert.equal(messages.at(-1).ok, true);
  assert.deepEqual(messages.at(-1).pack.grid[4], { id: 149, n: 1 });
  assert.deepEqual(messages.at(-1).pack.slots[0], { id: 152, n: 1 });
  for (const from of [
    null,
    { area: "chest", index: 0 },
    { area: "slots", index: -1 },
    { area: "grid", index: 10 },
  ]) {
    room.command("a", {
      type: "equipArmor",
      id: 152,
      from,
      baseRevision: 1,
      req: JSON.stringify(from),
    });
    assert.equal(messages.at(-1).ok, false);
  }
  assert.equal(player.equipment.head, 152);
});
