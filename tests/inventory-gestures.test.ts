import test from "node:test";
import assert from "node:assert/strict";
import { InventoryPack, maxStack, type Stack } from "../lib/inventory";
import { blankChest, chestCounts, type ChestSlots } from "../lib/chest-slots";
import { applyInventoryGesture, type InventoryGesture } from "../lib/inventory-gestures";
import { Multiplayer } from "../lib/multiplayer";
import { Room } from "../server/room";

function totals(pack: InventoryPack, chest: ChestSlots = [], drops: Stack[] = []) {
  const counts = pack.counts();
  for (const s of [...chest, ...drops]) if (s) counts[s.id] = (counts[s.id] ?? 0) + s.n;
  return counts;
}

function storedPack(room: Room, id = "a") {
  const pack = new InventoryPack();
  pack.restore(room.players.get(id)!.profile.pack as any);
  return pack;
}

function setup() {
  const messages: { id: string; data: any }[] = [];
  const room = new Room((id, data) => messages.push({ id, data }));
  room.join("a", "Alicja", undefined);
  room.join("b", "Bartek", undefined);
  const key = "overworld:30,51,29";
  room.players.get("a")!.p = [30, 50, 30];
  room.players.get("b")!.p = [31, 50, 30];
  room.ensure("overworld", 30, 30).set(30, 51, 29, 61);
  let seq = 0;
  const command = (id: string, data: Record<string, unknown>) => {
    const req = String(data.req ?? "test-" + ++seq);
    room.command(id, {
      baseRevision: Number(room.players.get(id)!.profile.inventoryRevision) || 0,
      ...data,
      req,
    } as any);
    return messages
      .slice()
      .reverse()
      .find((m) => m.id === id && m.data.req === req)!.data;
  };
  for (const id of ["a", "b"])
    assert.equal(command(id, { type: "chest", x: 30, y: 51, z: 29 }).ok, true);
  const install = (pack: InventoryPack, id = "a") => {
    const profile = room.players.get(id)!.profile;
    profile.pack = pack.snapshot();
    profile.inventory = pack.counts();
  };
  const seedChest = (slots: ChestSlots) => {
    room.slots[key] = structuredClone(slots);
    room.storage[key] = chestCounts(slots);
  };
  const gesture = (value: InventoryGesture, id = "a", chestKey: string | null = key) =>
    command(id, { type: "inventoryGesture", chestKey, gesture: value });
  return { room, key, command, gesture, install, seedChest };
}

test("Dragging merges only available capacity and returns the remainder to its source", () => {
  const pack = new InventoryPack(),
    chest = blankChest();
  chest[4] = { id: 8, n: 20 };
  pack.slots[10] = { id: 8, n: 60 };
  const before = totals(pack, chest);
  assert(
    applyInventoryGesture(
      pack,
      { type: "move", from: { area: "chest", index: 4 }, to: { area: "slots", index: 10 } },
      chest,
    ),
  );
  assert.deepEqual(pack.slots[10], { id: 8, n: 64 });
  assert.deepEqual(chest[4], { id: 8, n: 16 });
  assert.equal(pack.cursor, null);
  assert.deepEqual(totals(pack, chest), before);
  const full = pack.snapshot();
  assert(
    applyInventoryGesture(
      pack,
      { type: "move", from: { area: "chest", index: 4 }, to: { area: "slots", index: 10 } },
      chest,
    ),
  );
  assert.deepEqual(pack.snapshot(), full);
  assert.deepEqual(totals(pack, chest), before);
});

test("Dragging swaps unlike items across chest, crafting grid and hotbar without a cursor remainder", () => {
  const pack = new InventoryPack(),
    chest = blankChest();
  chest[0] = { id: 32, n: 7 };
  pack.grid[3] = { id: 9, n: 11 };
  pack.slots[1] = { id: 5, n: 3 };
  const before = totals(pack, chest);
  assert(
    applyInventoryGesture(
      pack,
      { type: "move", from: { area: "chest", index: 0 }, to: { area: "grid", index: 3 } },
      chest,
    ),
  );
  assert.deepEqual(pack.grid[3], { id: 32, n: 7 });
  assert.deepEqual(chest[0], { id: 9, n: 11 });
  assert(
    applyInventoryGesture(pack, {
      type: "move",
      from: { area: "grid", index: 3 },
      to: { area: "slots", index: 1 },
    }),
  );
  assert.deepEqual(pack.slots[1], { id: 32, n: 7 });
  assert.deepEqual(pack.grid[3], { id: 5, n: 3 });
  assert.equal(pack.cursor, null);
  assert.deepEqual(totals(pack, chest), before);
});

for (const [id, cursor, slot, chestAmount, grid] of [
  [8, 2, 20, 50, 9],
  [114, 5, 7, 9, 3],
  [108, 0, 1, 1, 1],
])
  test(`Double-click collect respects stack limit ${maxStack(id)} and conserves item ${id}`, () => {
    const pack = new InventoryPack(),
      chest = blankChest();
    pack.cursor = cursor ? { id, n: cursor } : null;
    pack.slots[5] = { id, n: slot };
    chest[12] = { id, n: chestAmount };
    pack.grid[2] = { id, n: grid };
    pack.slots[6] = { id: 3, n: 12 };
    const before = totals(pack, chest);
    assert(applyInventoryGesture(pack, { type: "collect", id }, chest));
    assert.deepEqual(pack.cursor, { id, n: maxStack(id) });
    assert.deepEqual(totals(pack, chest), before);
    assert(applyInventoryGesture(pack, { type: "collect", id }, chest));
    assert.deepEqual(totals(pack, chest), before);
  });

test("Collection fills from partial stacks before full ones and never changes a different cursor item", () => {
  const pack = new InventoryPack(),
    chest = blankChest();
  chest[0] = { id: 8, n: 64 };
  chest[1] = { id: 8, n: 4 };
  pack.slots[2] = { id: 8, n: 5 };
  pack.cursor = { id: 8, n: 55 };
  const before = totals(pack, chest);
  assert(applyInventoryGesture(pack, { type: "collect", id: 8 }, chest));
  assert.equal(chest[1], null);
  assert.equal(pack.slots[2], null);
  assert.deepEqual(chest[0], { id: 8, n: 64 });
  assert.deepEqual(pack.cursor, { id: 8, n: 64 });
  const snapshot = pack.snapshot();
  assert.equal(applyInventoryGesture(pack, { type: "collect", id: 9 }, chest), false);
  assert.deepEqual(pack.snapshot(), snapshot);
  assert.deepEqual(totals(pack, chest), before);
});

test("Invalid or hidden grid destinations do not remove the source stack", () => {
  const pack = new InventoryPack();
  pack.slots[0] = { id: 8, n: 12 };
  const before = pack.snapshot();
  for (const to of [
    { area: "grid", index: 8 },
    { area: "slots", index: 36 },
    { area: "chest", index: 0 },
  ] as const) {
    assert.equal(
      applyInventoryGesture(pack, { type: "move", from: { area: "slots", index: 0 }, to }),
      false,
    );
    assert.deepEqual(pack.snapshot(), before);
  }
});

test("Quick transfers fill partial stacks and empty slots in both chest directions", () => {
  const pack = new InventoryPack(),
    chest = blankChest();
  pack.slots[0] = { id: 8, n: 30 };
  chest[4] = { id: 8, n: 60 };
  const before = totals(pack, chest);
  assert(
    applyInventoryGesture(
      pack,
      { type: "click", slot: { area: "slots", index: 0 }, quick: true },
      chest,
    ),
  );
  assert.equal(pack.slots[0], null);
  assert.deepEqual(chest[4], { id: 8, n: 64 });
  assert.deepEqual(chest[0], { id: 8, n: 26 });
  pack.slots[0] = { id: 3, n: 64 };
  const nextBefore = totals(pack, chest);
  assert(
    applyInventoryGesture(
      pack,
      { type: "click", slot: { area: "chest", index: 4 }, quick: true },
      chest,
    ),
  );
  assert.deepEqual(pack.slots[1], { id: 8, n: 64 });
  assert.equal(chest[4], null);
  assert.deepEqual(totals(pack, chest), nextBefore);
  assert.equal(before[8], nextBefore[8]);
});

test("Authoritative chest pickup followed by collect uses server cursor and preserves all counts", () => {
  const s = setup(),
    pack = new InventoryPack(),
    chest = blankChest();
  pack.slots[4] = { id: 8, n: 30 };
  pack.grid[1] = { id: 8, n: 9 };
  chest[0] = { id: 8, n: 11 };
  chest[8] = { id: 8, n: 20 };
  s.install(pack);
  s.seedChest(chest);
  const before = totals(pack, chest);
  const picked = s.gesture({ type: "click", slot: { area: "chest", index: 0 } });
  assert.equal(picked.ok, true);
  assert.deepEqual(picked.pack.cursor, { id: 8, n: 11 });
  const collected = s.gesture({ type: "collect", id: 8 });
  assert.equal(collected.ok, true);
  assert.deepEqual(collected.pack.cursor, { id: 8, n: 64 });
  assert.deepEqual(totals(storedPack(s.room), s.room.slots[s.key]), before);
  assert.deepEqual(s.room.storage[s.key], chestCounts(s.room.slots[s.key]));
});

test("Two-player stale chest drag cannot move the replacement item", () => {
  const s = setup(),
    chest = blankChest(),
    b = new InventoryPack();
  chest[0] = { id: 8, n: 20 };
  b.cursor = { id: 9, n: 3 };
  s.install(b, "b");
  s.seedChest(chest);
  assert.equal(s.gesture({ type: "click", slot: { area: "chest", index: 0 } }, "b").ok, true);
  const result = s.gesture({
    type: "move",
    from: { area: "chest", index: 0 },
    to: { area: "slots", index: 2 },
    expected: { id: 8, n: 20 },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(s.room.slots[s.key][0], { id: 9, n: 3 });
  assert.equal(storedPack(s.room).slots[2], null);
  assert.deepEqual(storedPack(s.room, "b").cursor, { id: 8, n: 20 });
});

test("Duplicate request returns an immutable original snapshot after subsequent changes", () => {
  const s = setup(),
    chest = blankChest();
  chest[0] = { id: 8, n: 20 };
  s.seedChest(chest);
  const request = {
    type: "inventoryGesture",
    req: "immutable-pickup",
    chestKey: s.key,
    gesture: { type: "click", slot: { area: "chest", index: 0 } },
  };
  const original = s.command("a", request);
  const frozen = structuredClone(original);
  assert.equal(s.gesture({ type: "click", slot: { area: "chest", index: 5 } }).ok, true);
  const state = storedPack(s.room).snapshot();
  assert.deepEqual(s.command("a", request), frozen);
  assert.deepEqual(original, frozen);
  assert.deepEqual(storedPack(s.room).snapshot(), state);
  assert.deepEqual(s.room.slots[s.key][5], { id: 8, n: 20 });
  assert.equal(frozen.chest.slots[5], null);
});

test("Stale same-count profile and baseRevision cannot reset authoritative layout", () => {
  const s = setup(),
    pack = new InventoryPack();
  pack.slots[0] = { id: 8, n: 20 };
  s.install(pack);
  const revision = Number(s.room.players.get("a")!.profile.inventoryRevision);
  assert.equal(
    s.gesture(
      { type: "move", from: { area: "slots", index: 0 }, to: { area: "slots", index: 9 } },
      "a",
      null,
    ).ok,
    true,
  );
  s.room.profile("a", { pack: pack.snapshot(), inventoryRevision: revision });
  assert.equal(storedPack(s.room).slots[0], null);
  assert.deepEqual(storedPack(s.room).slots[9], { id: 8, n: 20 });
  const rejected = s.command("a", {
    type: "inventoryGesture",
    baseRevision: revision,
    chestKey: null,
    gesture: { type: "click", slot: { area: "slots", index: 9 } },
  });
  assert.equal(rejected.ok, false);
  assert.deepEqual(rejected.pack.slots[9], { id: 8, n: 20 });
  assert.equal(rejected.inventoryRevision, revision + 1);
});

test("Settling a full inventory creates shared overflow drops once and loses no items", () => {
  const s = setup(),
    pack = new InventoryPack();
  pack.slots = Array.from({ length: 36 }, () => ({ id: 3, n: 64 }));
  pack.grid[0] = { id: 5, n: 4 };
  pack.cursor = { id: 8, n: 13 };
  s.install(pack);
  const before = totals(pack),
    request = { type: "settleInventory", size: 2, req: "settle-full" };
  const result = s.command("a", request);
  assert.equal(result.ok, true);
  const after = storedPack(s.room);
  assert.equal(after.cursor, null);
  assert(after.grid.every((value) => value === null));
  assert.equal(s.room.drops.length, 2);
  assert.deepEqual(totals(after, [], s.room.drops), before);
  s.command("a", request);
  assert.equal(s.room.drops.length, 2);
  assert.deepEqual(totals(storedPack(s.room), [], s.room.drops), before);
});

function client(pack = new InventoryPack()) {
  const sent: any[] = [],
    notices: string[] = [];
  const game: any = {
    pack,
    inventory: pack.counts(),
    hotbar: pack.slots.slice(0, 9).map((s) => s?.id ?? 0),
    selected: 0,
    emit() {},
    notify(message: string) {
      notices.push(message);
    },
    adventure: {
      currentChest: "overworld:30,51,29",
      data: { chestSlots: {} as Record<string, ChestSlots>, storage: {} },
      chestSlots() {
        return this.data.chestSlots[this.currentChest] ?? blankChest();
      },
    },
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
    chestRevisions: new Map(),
    pending: new Map(),
    applied: new Set(),
    listeners: new Set(),
    token: "a".repeat(64),
    sequence: 0,
    sendInput() {},
    sendProfile() {},
    send(data: any) {
      sent.push(structuredClone(data));
    },
  });
  const commands = () => sent.filter((m) => m.type === "command").map((m) => m.command);
  return { net, game, commands, notices };
}

test("Client queues a rapid second-click collection behind pickup and uses acknowledged revision", () => {
  const c = client(),
    chest = blankChest();
  chest[0] = { id: 8, n: 11 };
  c.net.applyChest(c.game.adventure.currentChest, chest, 0);
  c.net.inventoryGesture({ type: "click", slot: { area: "chest", index: 0 } }, true);
  c.net.inventoryGesture({ type: "collect", id: 8 }, true);
  assert.equal(c.commands().length, 1);
  assert.equal(c.net.inventoryQueue.length, 1);
  const first = c.commands()[0],
    picked = new InventoryPack();
  picked.cursor = { id: 8, n: 11 };
  c.net.receive({
    type: "result",
    req: first.req,
    ok: true,
    inventoryRevision: 1,
    pack: picked.snapshot(),
  });
  assert.equal(c.commands().length, 2);
  assert.deepEqual(c.commands()[1].gesture, { type: "collect", id: 8 });
  assert.equal(c.commands()[1].baseRevision, 1);
  assert.deepEqual(c.game.pack.cursor, { id: 8, n: 11 });
});

test("Client ignores old pack and chest snapshots instead of rolling back newer revisions", () => {
  const pack = new InventoryPack();
  pack.slots[9] = { id: 8, n: 20 };
  const before = pack.snapshot();
  const c = client(pack),
    chest = blankChest(),
    old = new InventoryPack();
  c.net.inventoryRevision = 5;
  chest[3] = { id: 9, n: 12 };
  c.net.applyChest(c.game.adventure.currentChest, chest, 7);
  old.slots[0] = { id: 8, n: 2 };
  c.net.receive({
    type: "result",
    req: "old-ack",
    ok: true,
    inventoryRevision: 3,
    pack: old.snapshot(),
    chest: { key: c.game.adventure.currentChest, slots: blankChest(), revision: 6 },
  });
  assert.deepEqual(c.game.pack.snapshot(), before);
  assert.equal(c.net.inventoryRevision, 5);
  assert.deepEqual(c.game.adventure.chestSlots()[3], { id: 9, n: 12 });
});

test("A delayed pre-death acknowledgement cannot restore dropped items", () => {
  const pack = new InventoryPack();
  pack.slots[0] = { id: 8, n: 20 };
  const beforeDeath = pack.snapshot(),
    c = client(pack);
  c.net.inventoryRevision = 4;
  c.game.audio = { play() {} };
  c.game.pause = (panel: string) => {
    c.game.panel = panel;
  };
  c.net.receive({ type: "damage", health: 0, inventoryRevision: 5 });
  assert.equal(c.game.panel, "death");
  assert.deepEqual(c.game.pack.counts(), {});
  c.net.receive({
    type: "result",
    req: "late-before-death",
    ok: true,
    inventoryRevision: 4,
    pack: beforeDeath,
  });
  assert.equal(c.net.inventoryRevision, 5);
  assert.deepEqual(c.game.pack.counts(), {});
  assert(c.game.hotbar.every((id: number) => id === 0));
});

test("Closing an inventory queues settlement after its in-flight pickup", () => {
  const s = setup(),
    pack = new InventoryPack();
  pack.slots[0] = { id: 8, n: 20 };
  s.install(pack);
  const c = client(pack);
  c.net.inventoryRevision = Number(s.room.players.get("a")!.profile.inventoryRevision);
  c.net.inventoryGesture({ type: "click", slot: { area: "slots", index: 0 } });
  c.net.settleInventory();
  assert.equal(c.commands().length, 1);
  c.net.receive(s.command("a", c.commands()[0]));
  assert.equal(c.commands().length, 2);
  assert.equal(c.commands()[1].type, "settleInventory");
  c.net.receive(s.command("a", c.commands()[1]));
  assert.equal(c.game.pack.cursor, null);
  assert.deepEqual(c.game.pack.slots[0], { id: 8, n: 20 });
  assert.deepEqual(c.game.pack.counts(), { 8: 20 });
  assert.equal(c.net.inventoryQueue.length, 0);
  assert.equal(c.net.chestBusy, false);
});

test("Disconnected client retains gestures without becoming permanently busy", () => {
  const c = client();
  c.net.connected = false;
  c.net.inventoryGesture({ type: "click", slot: { area: "slots", index: 0 } });
  assert.equal(c.commands().length, 0);
  assert.equal(c.net.chestBusy, false);
  assert.equal(c.net.inventoryQueue.length, 1);
  c.net.connected = true;
  c.net.flushInventory();
  assert.equal(c.commands().length, 1);
  assert.equal(c.net.inventoryQueue.length, 0);
});

test("Client preserves the expected source captured when a chest drag began", () => {
  const c = client(),
    chest = blankChest();
  chest[0] = { id: 9, n: 3 };
  c.net.applyChest(c.game.adventure.currentChest, chest, 2);
  c.net.inventoryGesture(
    {
      type: "move",
      from: { area: "chest", index: 0 },
      to: { area: "slots", index: 1 },
      expected: { id: 8, n: 20 },
    },
    true,
  );
  assert.deepEqual(c.commands()[0].gesture.expected, { id: 8, n: 20 });
});
