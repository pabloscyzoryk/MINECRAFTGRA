import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { World, HEIGHT, type Chunk } from "../lib/world";
import {
  castleSites,
  firstCastle,
  describeCastle,
  castleLoot,
  generateCastleChunk,
  type CastleDescriptor,
} from "../lib/castles";
import { Mob } from "../lib/entities";
import { Room } from "../server/room";

function fixture(kind: "citadel" | "ruined" = "citadel") {
  const world = new World(24680);
  const castle = describeCastle({ ...firstCastle(world.seed), x: 0, z: 0, kind }, () => 19);
  for (let cx = -3; cx <= 2; cx++)
    for (let cz = -3; cz <= 4; cz++) {
      const c: Chunk = { cx, cz, data: new Uint8Array(HEIGHT * 256), dirty: true };
      generateCastleChunk(castle, c, world.seed);
      world.chunks.set(`${cx},${cz}`, c);
    }
  return { world, castle };
}
function freeHeadroom(world: World, x: number, y: number, z: number) {
  for (const dy of [0.05, 0.9, 1.79])
    assert.equal(world.solid(x, y + dy, z), false, `headroom ${x},${y + dy},${z}`);
  assert.equal(world.solid(x, y - 0.02, z), true, `supported ${x},${y},${z}`);
}
function dispose(room: Room) {
  for (const r of room.regions.values()) for (const m of r.mobs.values()) m.dispose();
}

test("Castle lookup is deterministic, sparse, biome-linked and keeps the starter village clear", () => {
  const variants = new Set<string>();
  for (const seed of [1, 42, 24680, 98765]) {
    const first = firstCastle(seed);
    assert.ok(Math.hypot(first.x, first.z) >= 239);
    assert.deepEqual(
      castleSites(seed, first.x, first.z, 0),
      castleSites(seed, first.x, first.z, 0),
    );
    assert.equal(castleSites(seed, 8, 22, 50).length, 0);
    const sites = castleSites(seed, 0, 0, 2048);
    assert.ok(sites.length < 50);
    assert.equal(new Set(sites.map((s) => s.id)).size, sites.length);
    for (const s of sites) variants.add(s.kind);
  }
  assert.deepEqual([...variants].sort(), ["citadel", "ruined"]);
});

test("Castle generation is clipped per chunk, order independent, and user edits win after generation", () => {
  const a = new World(),
    b = new World(),
    site = firstCastle(a.seed);
  const castle = a.castlesNearby(site.x, site.z, 0)[0];
  const positions = [
    [site.x - 32, site.z - 32],
    [site.x + 29, site.z + 29],
    [site.x, site.z],
  ];
  for (const [x, z] of positions) a.chunk(Math.floor(x / 16), Math.floor(z / 16));
  for (const [x, z] of [...positions].reverse()) b.chunk(Math.floor(x / 16), Math.floor(z / 16));
  assert.equal(a.chunks.size, 3, "the castle must never pre-generate neighboring chunks");
  for (const [key, c] of a.chunks) assert.deepEqual(c.data, b.chunks.get(key)!.data);
  const [x, y, z] = castle.loot[0].p;
  a.edits[`overworld:${x},${y},${z}`] = 0;
  a.edits[`overworld:${x + 1},${y},${z}`] = 23;
  a.chunks.clear();
  a.chunk(Math.floor(x / 16), Math.floor(z / 16));
  assert.equal(a.get(x, y, z), 0);
  assert.equal(a.get(x + 1, y, z), 23);
  a.dimension = "nether";
  assert.deepEqual(a.castlesNearby(site.x, site.z), []);
});

test("Three keep storeys and tower switchbacks have real stair steps and standing headroom", () => {
  const { world, castle: c } = fixture();
  for (const level of [0, 6, 12]) {
    const east = level !== 6,
      lane = east ? -15.5 : -11.5;
    for (let n = 0; n < 6; n++) {
      const x = east ? -10 + n : -5 - n;
      assert.equal(world.get(x, c.y + level + n, lane), east ? 183 : 185);
      freeHeadroom(world, x + (east ? 0.25 : 0.75), c.y + level + n + 0.5, lane);
      freeHeadroom(world, x + (east ? 0.75 : 0.25), c.y + level + n + 1, lane);
    }
    for (const z of [-15.5, -14.5, -13.5, -12.5, -11.5, -10.5])
      freeHeadroom(world, east ? -3.5 : -10.5, c.y + level + 6, z);
  }
  for (const level of [0, 8])
    for (let n = 0; n < 4; n++) {
      freeHeadroom(world, 29 - 3 + n + 0.25, c.y + level + n + 0.5, 29 - 1.5);
      freeHeadroom(world, 29 - n + 0.75, c.y + level + 4 + n + 0.5, 29 + 1.5);
    }
  for (const entry of c.loot) {
    assert.equal(world.get(...entry.p), 61);
    assert.ok(castleLoot(c, ...entry.p));
  }
  assert.equal(castleLoot(c, 0, c.y, 0), null);
  assert.equal(world.get(19, c.y, 6), 190);
  assert.equal(world.get(19, c.y, 5), 194);
});

test("Ruins preserve the gate, keep stair routes and treasure while visibly breaking a tower crown", () => {
  const intact = fixture(),
    ruined = fixture("ruined"),
    y = ruined.castle.y;
  let lost = 0;
  for (let x = 25; x <= 33; x++)
    for (let z = -33; z <= -25; z++)
      for (let h = y + 11; h < y + 17; h++)
        if (intact.world.get(x, h, z) !== 0 && ruined.world.get(x, h, z) === 0) lost++;
  assert.ok(lost > 100);
  assert.equal(ruined.world.get(0, y + 1, 32), 0);
  for (const entry of ruined.castle.loot) assert.equal(ruined.world.get(...entry.p), 61);
  assert.equal(ruined.castle.guards.length, 3);
});

test("Knights have articulated armor, sword and shield and defend only their castle territory", () => {
  const { world, castle } = fixture(),
    knight = new Mob("knight", -5, 24, world);
  knight.group.position.set(-5.5, castle.y, 24.5);
  knight.guard = {
    id: "castle:first:guard:0",
    castleId: "castle:first",
    home: [0, castle.y, 0],
    post: [-5.5, castle.y, 24.5],
    radius: 42,
  };
  try {
    assert.equal(knight.hp, 44);
    assert.equal(knight.arms.length, 2);
    assert.ok(knight.group.getObjectByName("knight-sword"));
    assert.ok(knight.group.getObjectByName("knight-shield"));
    knight.poseArms(-1);
    const idle = knight.arms[1].rotation.x;
    knight.poseArms(0.25);
    assert.ok(knight.arms[1].rotation.x > idle + 1);
    let damage = 0;
    knight.attackClock = 0.4;
    knight.speed = 0;
    knight.update(
      0.1,
      0,
      new THREE.Vector3(-5.5, castle.y, 23),
      world,
      (n) => (damage += n),
      () => {},
      () => {},
    );
    assert.equal(damage, 5);
    knight.group.position.set(0, castle.y, 42);
    knight.attackClock = 0.4;
    knight.update(
      0.1,
      0,
      new THREE.Vector3(0, castle.y, 43),
      world,
      (n) => (damage += n),
      () => {},
      () => {},
    );
    assert.equal(damage, 5, "a pending swing must not hurt somebody who left the territory");
  } finally {
    knight.dispose();
  }
});

test("Knights walk through the open gate without snapping to roofs and do not cross solid walls", () => {
  const { world, castle } = fixture(),
    knight = new Mob("knight", 0, 24, world);
  knight.group.position.set(0.5, castle.y, 25.5);
  knight.guard = {
    id: "g",
    castleId: "castle:first",
    home: [0, castle.y, 0],
    post: [0.5, castle.y, 25.5],
    radius: 42,
  };
  try {
    for (let i = 0; i < 40; i++)
      knight.update(
        0.1,
        0,
        new THREE.Vector3(0.5, castle.y, 38),
        world,
        () => {},
        () => {},
        () => {},
      );
    assert.ok(knight.group.position.z > 31);
    assert.ok(Math.abs(knight.group.position.y - castle.y) < 0.6);
    knight.group.position.set(10.5, castle.y, 28.5);
    knight.hurt = 0;
    for (let i = 0; i < 40; i++)
      knight.update(
        0.1,
        0,
        new THREE.Vector3(10.5, castle.y, 36),
        world,
        () => {},
        () => {},
        () => {},
      );
    assert.ok(knight.group.position.z < 30.8);
  } finally {
    knight.dispose();
  }
});

test("Shared castle guards spawn once, retain territorial state on restore, and defeated guards never respawn", () => {
  const room = new Room(() => {}),
    restored = new Room(() => {});
  try {
    room.join("a", "Alicja", undefined);
    room.join("b", "Bartek", undefined);
    const first = firstCastle(room.seed),
      castle = room.region("overworld").world.castlesNearby(first.x, first.z, 0)[0];
    for (const p of room.players.values()) {
      p.p = [castle.x, castle.y, castle.z + 24];
      room.populate(p);
    }
    const mobs = room.region("overworld").mobs;
    assert.equal([...mobs.values()].filter((m) => m.kind === "knight").length, 4);
    const guard = mobs.get(castle.guards[0].id)!;
    room.hitMob(room.players.get("a")!, guard, 100);
    assert.ok(room.castleDefeated.has(guard.guard!.id));
    const saved = room.save();
    restored.restore(saved);
    const survivor = restored.region("overworld").mobs.get(castle.guards[1].id)!;
    assert.deepEqual(survivor.guard, mobs.get(castle.guards[1].id)!.guard);
    const dead = restored.region("overworld").mobs.get(guard.guard!.id)!;
    dead.dispose();
    restored.region("overworld").mobs.delete(guard.guard!.id);
    restored.populate(restored.players.get("a")!);
    assert.equal(restored.region("overworld").mobs.has(guard.guard!.id), false);
    assert.equal(
      [...restored.region("overworld").mobs.values()].filter((m) => m.kind === "knight").length,
      3,
    );
  } finally {
    dispose(room);
    dispose(restored);
  }
});
