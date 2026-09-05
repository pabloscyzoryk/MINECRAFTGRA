import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Game } from "../lib/engine";
import { Adventure } from "../lib/adventure";
import { Multiplayer } from "../lib/multiplayer";
import { World } from "../lib/world";
import { FluidSystem } from "../lib/fluid";
import { InventoryPack } from "../lib/inventory";
import { placeBed } from "../lib/bed";
import { DEFAULT_SETTINGS, DEFAULT_BINDINGS } from "../lib/settings";
import { isSafeStandingPosition } from "../lib/safe-spawn";

function browser(run: () => void) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { hidden: false, pointerLockElement: null },
  });
  try {
    run();
  } finally {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else Reflect.deleteProperty(globalThis, "document");
  }
}
function fixture(yaw = 0) {
  const world = new World();
  for (let x = 25; x <= 35; x++)
    for (let z = 25; z <= 35; z++) {
      world.chunk(Math.floor(x / 16), Math.floor(z / 16));
      world.set(x, 49, z, 3);
      for (let y = 50; y <= 55; y++) world.set(x, y, z, 0);
    }
  assert(placeBed(world, [30, 50, 30], yaw));
  const game = Object.create(Game.prototype) as Game,
    pack = new InventoryPack();
  pack.slots[0] = { id: 106, n: 3 };
  const drops: { id: number; n: number; position: THREE.Vector3 }[] = [];
  Object.assign(game, {
    world,
    pack,
    fluid: new FluidSystem(world),
    inventory: pack.counts(),
    hotbar: pack.slots.slice(0, 9).map((s) => s?.id ?? 0),
    selected: 0,
    health: 20,
    food: 12,
    oxygen: 20,
    xp: 0,
    damageTimer: 0,
    damageFlash: 0,
    started: true,
    active: true,
    preview: false,
    mode: "survival",
    difficulty: "normal",
    pauseReason: "",
    keys: new Set(),
    position: new THREE.Vector3(32.5, 50, 30.5),
    velocity: new THREE.Vector3(),
    camera: new THREE.PerspectiveCamera(),
    sun: new THREE.DirectionalLight(),
    torch: new THREE.PointLight(),
    hand: new THREE.Group(),
    yaw: 0,
    pitch: 0,
    eyeHeight: 1.62,
    perspective: 0,
    time: 0,
    clock: 90,
    rest: null,
    eating: null,
    net: null,
    avatar: null,
    horrorThreat: null,
    settings: { ...DEFAULT_SETTINGS, bindings: { ...DEFAULT_BINDINGS } },
    audio: { play() {}, enable() {} },
    drops: {
      spawn(id: number, n: number, position: THREE.Vector3) {
        drops.push({ id, n, position });
      },
    },
    cracks: { update() {} },
    outline: { visible: false },
    crystals: [],
    mobs: [],
    ensure(x: number, z: number) {
      world.chunk(Math.floor(x / 16), Math.floor(z / 16));
    },
    emit() {
      (this as unknown as Game).syncPack();
    },
    save() {},
    notify() {},
    onMenu() {},
    capturePointer() {},
    resetHorrorHunt() {},
    clearDynamic() {},
    dimensionChanged() {},
    spawnDragon() {},
  });
  game.adventure = new Adventure(game);
  const killAway = () => {
    game.position.set(80.5, 50, 80.5);
    game.damageTimer = 0;
    game.damageFrom(100, game.position.clone().add(new THREE.Vector3(0, 1.6, -1)), "mob");
    assert.equal(game.health, 0);
    assert.equal(game.pauseReason, "death");
  };
  return { game, world, drops, killAway };
}

test("Using either bed half sets canonical respawn: a later real mob death away from it returns beside the bed with no items duplicated", () =>
  browser(() => {
    for (const yaw of [0, -Math.PI / 2, -Math.PI, -Math.PI * 1.5]) {
      const { game: g, world, drops, killAway } = fixture(yaw);
      assert(g.beginRest(30, 50, 30));
      const head = g.rest!.head;
      g.endRest(true);
      assert(g.beginRest(...head));
      assert.deepEqual(g.adventure.data.bedSpawn, [30, 50, 30]);
      g.endRest(true);
      killAway();
      assert.equal(
        drops.reduce((n, d) => n + d.n, 0),
        3,
      );
      g.respawn();
      assert(g.position.distanceTo(new THREE.Vector3(30.5, 50, 30.5)) < 5);
      assert(!g.collision(g.position));
      assert(world.solid(g.position.x, g.position.y - 0.01, g.position.z));
      assert.equal(g.health, 20);
      assert.equal(g.active, true);
      assert.deepEqual(g.inventory, {});
      assert.equal(drops.length, 1);
    }
  }));

test("Placed but unused beds and beds broken after use fall back to the world spawn, never the death location", () =>
  browser(() => {
    for (const scenario of ["unused", "brokenFoot", "brokenHead"]) {
      const { game: g, world, killAway } = fixture();
      if (scenario !== "unused") {
        assert(g.beginRest(30, 50, 30));
        const head = g.rest!.head;
        g.endRest(true);
        world.set(...(scenario === "brokenHead" ? head : ([30, 50, 30] as const)), 0);
      }
      killAway();
      g.respawn();
      assert.equal(g.position.x, 8.5);
      assert.equal(g.position.z, 22.5);
      assert(!g.collision(g.position));
      assert.equal(g.adventure.data.spawn, null);
      assert.equal(g.adventure.data.bedSpawn, null);
    }
  }));

test("Actual solo respawn avoids a flooded or cactus-covered fallback and keeps death drops unchanged", () =>
  browser(() => {
    for (const hazard of [7, 15, 41]) {
      const { game: g, world, killAway, drops } = fixture();
      const top = world.surface(8.5, 22.5);
      world.set(8, top, 22, hazard);
      const edits = JSON.stringify(world.edits);
      killAway();
      g.respawn();
      assert.equal(g.health, 20);
      assert(isSafeStandingPosition(world, g.position.toArray()));
      assert.notDeepEqual([g.position.x, g.position.z], [8.5, 22.5]);
      assert.equal(JSON.stringify(world.edits), edits);
      assert.equal(drops.length, 1);
      assert.deepEqual(g.inventory, {});
    }
  }));

test("Solo respawn with no safe fallback stays dead and does not move or reset the death state", () =>
  browser(() => {
    const { game: g, world, killAway, drops } = fixture();
    killAway();
    const position = g.position.toArray();
    world.get = (_x, y, _z) => (y < 1 ? 3 : 15);
    world.surface = () => 1;
    world.chunk = (() => undefined) as unknown as World["chunk"];
    g.respawn();
    assert.equal(g.health, 0);
    assert.equal(g.active, false);
    assert.equal(g.pauseReason, "death");
    assert.deepEqual(g.position.toArray(), position);
    assert.equal(drops.length, 1);
  }));

test("Serialized and older Adventure saves resolve the actual bed and choose new clearance when the old exit is obstructed", () =>
  browser(() => {
    for (const legacy of [false, true]) {
      const { game: g, world, killAway } = fixture();
      g.beginRest(30, 50, 30);
      g.endRest(true);
      const saved = JSON.parse(JSON.stringify(g.adventure.data));
      if (legacy) delete saved.bedSpawn;
      g.adventure.restore(saved);
      const old = g.adventure.data.spawn!;
      world.set(Math.floor(old.x), Math.floor(old.y), Math.floor(old.z), 3);
      world.set(Math.floor(old.x), Math.floor(old.y) + 1, Math.floor(old.z), 3);
      killAway();
      g.respawn();
      assert(g.position.distanceTo(new THREE.Vector3(30.5, 50, 30.5)) < 5);
      assert(!g.collision(g.position));
      assert.deepEqual(g.adventure.data.bedSpawn, [30, 50, 30]);
      assert.notDeepEqual(g.position.toArray(), [old.x, old.y, old.z]);
    }
  }));

function client(g: Game) {
  const sent: any[] = [];
  const net = Object.assign(Object.create(Multiplayer.prototype), {
    game: g,
    connected: true,
    initialized: true,
    closed: false,
    id: "self",
    token: "a".repeat(64),
    sequence: 0,
    pending: new Map(),
    applied: new Set(),
    inventoryRevision: 4,
    bedRestRevision: 2,
    listeners: new Set(),
    inventoryQueue: [],
    send(packet: unknown) {
      sent.push(packet);
    },
    sendProfile() {},
    refreshFurnace() {},
    settleInventory() {},
    emit() {},
  }) as Multiplayer;
  g.net = net;
  return { net, sent };
}
const respawnResult = (req: string) => ({
  type: "result",
  req,
  ok: true,
  health: 20,
  food: 20,
  inventoryRevision: 5,
  pack: new InventoryPack().snapshot(),
  bedRest: null,
  bedRestRevision: 3,
  dimension: "overworld",
  p: [29.5, 50, 30.5],
  yaw: 0.2,
});

test("Multiplayer respawn waits for one authoritative ACK before reviving, then applies its position and sends the new revision", () =>
  browser(() => {
    const { game: g } = fixture();
    const { net, sent } = client(g);
    g.position.set(80.5, 50, 80.5);
    g.health = 0;
    g.active = false;
    g.pauseReason = "death";
    g.respawn();
    g.respawn();
    const commands = sent.filter((p) => p.type === "command");
    assert.equal(commands.length, 1);
    assert.equal(g.health, 0);
    assert.equal(g.active, false);
    assert.deepEqual(g.position.toArray(), [80.5, 50, 80.5]);
    assert.equal(sent.find((p) => p.type === "input").bedRestRevision, 2);
    net.receive(respawnResult(commands[0].command.req));
    assert.deepEqual(g.position.toArray(), [29.5, 50, 30.5]);
    assert.equal(g.health, 20);
    assert.equal(g.active, true);
    assert.equal(g.velocity.length(), 0);
    assert.equal(g.fallDistance, 0);
    net.sendInput();
    assert.equal(sent.at(-1).bedRestRevision, 3);
    assert.deepEqual(sent.at(-1).p, [29.5, 50, 30.5]);
    net.applyBedRest(null, 2, [80.5, 50, 80.5]);
    assert.deepEqual(
      g.position.toArray(),
      [29.5, 50, 30.5],
      "An older frame cannot restore the death location",
    );
  }));

test("Respawn from another dimension switches the world before placing the player and stale cached health cannot revive a later death", () =>
  browser(() => {
    const { game: g } = fixture(),
      { net, sent } = client(g);
    g.world.switch("nether");
    g.position.set(80.5, 50, 80.5);
    g.health = 0;
    g.active = false;
    g.respawn();
    const req = sent.find((p) => p.type === "command").command.req;
    net.receive(respawnResult(req));
    assert.equal(g.world.dimension, "overworld");
    assert.deepEqual(g.position.toArray(), [29.5, 50, 30.5]);
    assert(!g.collision(g.position));
    net.inventoryRevision = 6;
    g.health = 0;
    g.active = false;
    net.applied.clear();
    net.receive(respawnResult(req));
    assert.equal(g.health, 0);
    assert.equal(g.active, false);
  }));
