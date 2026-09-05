import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Multiplayer } from "../lib/multiplayer";
import { InventoryPack } from "../lib/inventory";
import { emptyEquipment } from "../lib/armor";
import { Room } from "../server/room";
import { Mob } from "../lib/entities";

function client() {
  const sent: any[] = [],
    pack = new InventoryPack(),
    game: any = {
      active: false,
      needsCapture: false,
      pauseReason: "chest",
      health: 20,
      position: new THREE.Vector3(40, 30, 40),
      velocity: new THREE.Vector3(2, -6, 1),
      yaw: 0.5,
      pitch: 0.2,
      world: { dimension: "overworld" },
      grounded: false,
      sprinting: true,
      crouching: true,
      swingTime: 0.1,
      rightDown: true,
      eatingHeld() {
        return this.rightDown;
      },
      hotbar: [126, 0, 0, 0, 0, 0, 0, 0, 0],
      selected: 0,
      pack,
      inventory: {},
      adventure: {
        currentChest: "",
        currentFurnace: "",
        data: { equipment: emptyEquipment(), armor: 0, furnaces: {}, chestSlots: {}, storage: {} },
      },
      emit() {},
      notify() {},
      audio: { play() {} },
      pause(reason: string) {
        this.pauseReason = reason;
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
    furnaceRefreshKey: null,
    furnaceRevisions: new Map(),
    chestRevisions: new Map(),
    pending: new Map(),
    applied: new Set(),
    listeners: new Set(),
    remotes: new Map(),
    entities: new Map(),
    faceFrames: new Map(),
    lastFrame: null,
    token: "a".repeat(64),
    sequence: 0,
    players: [],
    clock: 0,
    horrorClock: 0,
    huntClock: 0,
    networkClock: 0,
    profileClock: 0,
    uiClock: 0,
    sendProfile() {},
    send(data: any) {
      sent.push(structuredClone(data));
    },
  });
  return {
    game,
    net,
    sent,
    commands: () => sent.filter((m) => m.type === "command").map((m) => m.command),
  };
}

test("Every menu keeps sending changing physics positions but suppresses stale movement and attack flags", () => {
  const c = client();
  for (const reason of ["chest", "furnace", "inventory", "crafting", "chat", "settings", "pause"]) {
    c.game.pauseReason = reason;
    c.game.position.y -= 0.5;
    c.net.sendInput();
    const input = c.sent.at(-1);
    assert.deepEqual(input.p, c.game.position.toArray());
    assert.equal(input.active, false);
    for (const flag of ["moving", "sprinting", "crouch", "swing", "blocking", "usingFood"])
      assert.equal(input[flag], false, reason + ":" + flag);
    assert.equal(input.swingProgress, -1);
    assert.equal(input.grounded, false);
  }
  c.game.active = true;
  c.net.sendInput();
  for (const flag of ["active", "moving", "sprinting", "crouch", "swing", "blocking", "usingFood"])
    assert.equal(c.sent.at(-1)[flag], true);
});

test("A lost pointer capture suppresses control flags without stopping positional synchronization", () => {
  const c = client();
  c.game.active = true;
  c.game.needsCapture = true;
  c.net.sendInput();
  assert.equal(c.sent.at(-1).active, false);
  assert.equal(c.sent.at(-1).moving, false);
  assert.equal(c.sent.at(-1).blocking, false);
  assert.deepEqual(c.sent.at(-1).p, [40, 30, 40]);
});

test("The actual networking tick sends a falling menu player's updated positions at its normal cadence", () => {
  const c = client();
  c.net.tick(0.1);
  c.game.position.y = 29;
  c.net.tick(0.1);
  const inputs = c.sent.filter((m) => m.type === "input");
  assert.equal(inputs.length, 2);
  assert.equal(inputs[0].p[1], 30);
  assert.equal(inputs[1].p[1], 29);
  assert(inputs.every((m) => m.active === false));
});

test("Server accepts inactive falling positions and refreshes presence while clearing client attack flags", () => {
  let now = 100000;
  const room = new Room(
    () => {},
    () => now,
  );
  room.join("a", "Alicja", undefined, "horror");
  const p = room.players.get("a")!;
  p.profile.inventory = { 126: 1 };
  p.active = true;
  now += 100;
  room.input("a", {
    p: [40, 29, 40],
    dimension: "overworld",
    active: false,
    moving: true,
    sprinting: true,
    crouch: true,
    swing: true,
    swingProgress: 0.3,
    blocking: true,
    held: 126,
    grounded: false,
  });
  assert.deepEqual(p.p, [40, 29, 40]);
  assert.equal(p.seen, now);
  for (const flag of ["active", "moving", "sprinting", "crouch", "swing", "blocking"] as const)
    assert.equal(p[flag], false);
  assert.equal(p.swingProgress, -1);
  assert.equal(p.grounded, false);
  for (let i = 0; i < 20; i++) room.tickHorror(0.25, [p]);
  assert.equal(room.horror.states.size, 0, "Menu physics must not turn on horror activity");
});

test("Fall damage is not discarded while a chest gesture is in flight, and reordered ACKs conserve the pack", () => {
  const c = client(),
    messages: any[] = [],
    room = new Room((_id, data) => messages.push(data));
  c.game.pack.slots[0] = { id: 3, n: 1 };
  c.game.inventory = { 3: 1 };
  room.join("a", "Alicja", undefined);
  const p = room.players.get("a")!;
  p.profile.pack = c.game.pack.snapshot();
  p.profile.inventory = { 3: 1 };
  p.active = false;
  c.net.inventoryGesture({ type: "click", slot: { area: "slots", index: 0 } });
  assert.equal(c.net.chestBusy, true);
  const hazard = c.net.request({ type: "environmentDamage", amount: 4, reason: "fall" });
  assert(hazard);
  assert.equal(c.commands().length, 2);
  room.command("a", c.commands()[0]);
  const inventoryAck = structuredClone(messages.at(-1));
  room.command("a", c.commands()[1]);
  const hazardAck = structuredClone(messages.at(-1)),
    damage = messages.find((m) => m.type === "damage");
  assert.equal(damage.health, 16);
  assert.equal(damage.reason, "fall");
  c.net.receive(damage);
  c.net.receive(hazardAck);
  c.net.receive(inventoryAck);
  assert.equal(c.game.health, 16);
  assert.deepEqual(c.game.pack.cursor, { id: 3, n: 1 });
  assert.deepEqual(c.game.pack.counts(), { 3: 1 });
  assert.equal(c.net.pending.size, 0);
  assert.equal(c.net.chestBusy, false);
  assert.equal(c.net.inventoryRevision, 2);
});

test("Opening a panel does not confer PvP invulnerability or retain an old shield block", () => {
  const room = new Room(
    () => {},
    () => 100000,
  );
  room.join("a", "Alicja", undefined);
  room.join("b", "Bartek", undefined);
  const a = room.players.get("a")!,
    b = room.players.get("b")!;
  a.p = [40, 50, 40];
  a.held = 104;
  a.active = true;
  a.spawnUntil = 0;
  b.profile.inventory = { 126: 1 };
  b.spawnUntil = 0;
  room.input("b", {
    p: [40, 50, 38],
    dimension: "overworld",
    active: false,
    held: 126,
    blocking: true,
    yaw: Math.PI,
  });
  const world = room.ensure("overworld", 40, 40);
  for (let z = 37; z <= 41; z++) for (let y = 50; y <= 53; y++) world.set(40, y, z, 0);
  room.command("a", { type: "pvp", target: "b", req: "hit" });
  assert.equal(b.blocking, false);
  assert.equal(b.health, 14);
});

test("Server mob frames and restored saves preserve ranged attack animation state", () => {
  const room = new Room(() => {}),
    world = room.region("overworld").world,
    mob = new Mob("skeleton", 10, 10, world);
  mob.attackClock = 0.48;
  mob.rangedAttack = true;
  room.region("overworld").mobs.set("archer", mob);
  const wire = room.frame().mobs.overworld![0];
  assert.equal(wire.attackClock, 0.48);
  assert.equal(wire.rangedAttack, true);
  const restored = new Room(() => {});
  restored.restore(room.save());
  assert.equal(restored.region("overworld").mobs.get("archer")!.rangedAttack, true);
  assert.equal(restored.region("overworld").mobs.get("archer")!.attackClock, 0.48);
  mob.dispose();
  restored.region("overworld").mobs.get("archer")!.dispose();
});

test("Multiplayer applies attack progress and bow pose to the visible mob without running combat callbacks", () => {
  const c = client(),
    room = new Room(() => {}),
    world = room.region("overworld").world,
    mob = new Mob("skeleton", 10, 10, world);
  mob.attackClock = 0.48;
  mob.rangedAttack = true;
  room.region("overworld").mobs.set("archer", mob);
  c.game.world = world;
  c.game.scene = new THREE.Scene();
  c.game.position.set(10, 20, 10);
  c.net.syncMobs(room.frame());
  const remote = c.net.entities.get("archer")!;
  assert.equal(remote.attackClock, 0.48);
  assert.equal(remote.rangedAttack, true);
  assert.equal(remote.group.parent, c.game.scene);
  assert.equal(c.game.health, 20);
  assert.equal(c.commands().length, 0);
  mob.dispose();
  remote.dispose();
});
