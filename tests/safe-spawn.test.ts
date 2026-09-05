import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../lib/world";
import { findSafeWorldSpawn, isSafeStandingPosition } from "../lib/safe-spawn";
import { bedRestExit, resolveBedRest } from "../lib/bed-rest";
import { placeBed } from "../lib/bed";
import { touchesCactus } from "../lib/cactus-contact";
import { playerBox } from "../lib/block-shapes";

test("World spawn skips a lava or water pool and a cactus at the default column without changing terrain", () => {
  for (const hazard of [7, 15, 41]) {
    const world = new World();
    const top = world.surface(8.5, 22.5);
    world.set(8, top, 22, hazard);
    const before = JSON.stringify(world.edits);
    const spawn = findSafeWorldSpawn(world);
    assert(spawn);
    assert(isSafeStandingPosition(world, spawn));
    assert.notDeepEqual([spawn[0], spawn[2]], [8.5, 22.5]);
    assert.equal(JSON.stringify(world.edits), before);
    assert.deepEqual(findSafeWorldSpawn(world), spawn, "The search is deterministic");
  }
});

test("Standing clearance checks the entire body, support and cactus thorns, including contact from above", () => {
  const cells = new Map<string, number>();
  const world = {
    get: (x: number, y: number, z: number) => cells.get([x, y, z].join()) ?? (y < 10 ? 3 : 0),
  };
  const p = [8.5, 10, 22.5] as const;
  assert(isSafeStandingPosition(world, p));
  for (const obstacle of [3, 170, 172, 7, 15]) {
    cells.set("8,11,22", obstacle);
    assert(!isSafeStandingPosition(world, p), `Head/body obstacle ${obstacle}`);
  }
  cells.clear();
  cells.set("8,9,22", 41);
  assert(!isSafeStandingPosition(world, p));
  cells.clear();
  cells.set("9,10,22", 41);
  assert(
    !isSafeStandingPosition(world, [8.72, 10, 22.5]),
    "Thin cactus body does not hide the protruding spikes",
  );
  cells.clear();
  cells.set("8,9,22", 0);
  assert(!isSafeStandingPosition(world, p), "No midair spawn");
});

test("Exact slab support is safe, but a low ceiling and a bed support are rejected", () => {
  const cells = new Map([["8,9,22", 170]]);
  const world = { get: (x: number, y: number, z: number) => cells.get([x, y, z].join()) ?? 0 };
  assert(isSafeStandingPosition(world, [8.5, 9.5, 22.5]));
  cells.set("8,11,22", 3);
  assert(!isSafeStandingPosition(world, [8.5, 9.5, 22.5]));
  cells.delete("8,11,22");
  cells.set("8,9,22", 190);
  assert(!isSafeStandingPosition(world, [8.5, 9.5625, 22.5]));
});

test("A completely hazardous search area returns null instead of modifying or inventing a spawn", () => {
  const world = {
    get: (_x: number, y: number, _z: number) => (y < 1 ? 3 : 15),
    surface: () => 1,
  };
  assert.equal(findSafeWorldSpawn(world), null);
  assert.equal(findSafeWorldSpawn(world, NaN, 22.5), null);
});

test("Bed respawn and standing exit also reject cactus support beside the bed", () => {
  const world = new World();
  for (let x = 25; x <= 35; x++)
    for (let z = 25; z <= 35; z++) {
      world.chunk(Math.floor(x / 16), Math.floor(z / 16));
      world.set(x, 49, z, 41);
      for (let y = 50; y <= 55; y++) world.set(x, y, z, 0);
    }
  world.set(30, 49, 30, 3);
  world.set(30, 49, 29, 3);
  world.set(32, 49, 30, 3);
  assert(placeBed(world, [30, 50, 30], 0));
  const rest = resolveBedRest(world, 30, 50, 30)!;
  const exit = bedRestExit(world, rest);
  assert.deepEqual(exit, [32.5, 50, 30.5]);
  assert(
    !touchesCactus(
      (x, y, z) => world.get(x, y, z),
      playerBox({ x: exit![0], y: exit![1], z: exit![2] }),
    ),
  );
});
