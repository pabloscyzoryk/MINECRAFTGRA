import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Adventure } from "../lib/adventure";
import { Game } from "../lib/engine";
import { InventoryPack } from "../lib/inventory";
import { World } from "../lib/world";
import { castleLoot, firstCastle } from "../lib/castles";
import type { Mob } from "../lib/entities";

function game() {
  const world = new World(),
    grants: number[][] = [],
    messages: string[] = [];
  const g: any = {
    world,
    mode: "creative",
    net: null,
    position: new THREE.Vector3(8, 20, 22),
    velocity: new THREE.Vector3(),
    scene: new THREE.Scene(),
    mobs: [] as Mob[],
    pack: new InventoryPack(),
    inventory: {},
    xp: 0,
    audio: { play() {} },
    burst() {},
    emit() {},
    pause(reason: string) {
      this.pauseReason = reason;
    },
    notify(message: string) {
      messages.push(message);
    },
    add(id: number, n: number) {
      grants.push([id, n]);
    },
    ensure(x: number, z: number) {
      for (let cx = Math.floor(x / 16) - 1; cx <= Math.floor(x / 16) + 1; cx++)
        for (let cz = Math.floor(z / 16) - 1; cz <= Math.floor(z / 16) + 1; cz++)
          world.chunk(cx, cz);
    },
  };
  const adventure = new Adventure(g);
  g.adventure = adventure;
  const first = firstCastle(world.seed),
    castle = world.castlesNearby(first.x, first.z, 0)[0];
  const clearMobs = () => {
    for (const mob of g.mobs) {
      g.scene.remove(mob.group);
      mob.dispose();
    }
    g.mobs = [];
  };
  return { g, adventure, world, castle, grants, messages, clearMobs };
}

test("Single-player guard defeat is recorded immediately and survives dimension changes and an Adventure restore", () => {
  const c = game(),
    next = game();
  try {
    c.g.position.set(c.castle.x, c.castle.y, c.castle.z + 24);
    c.adventure.spawnCastleGuards();
    c.adventure.spawnCastleGuards();
    assert.equal(c.g.mobs.length, 4);
    const guard: Mob = c.g.mobs[0],
      id = guard.guard!.id;
    Game.prototype.hitMob.call(c.g, guard, 100);
    assert.ok(
      c.adventure.data.castleDefeated.includes(id),
      "record before the next periodic spawn scan",
    );
    const saved = JSON.parse(JSON.stringify(c.adventure.data));
    c.clearMobs();
    c.world.switch("nether");
    c.adventure.spawnCastleGuards();
    assert.equal(c.g.mobs.length, 0);
    c.world.switch("overworld");
    c.adventure.spawnCastleGuards();
    assert.equal(c.g.mobs.length, 3);
    assert.ok(c.g.mobs.every((m: Mob) => m.guard?.id !== id));
    next.adventure.restore(saved);
    next.g.position.copy(c.g.position);
    next.adventure.spawnCastleGuards();
    assert.equal(next.g.mobs.length, 3);
    assert.ok(next.g.mobs.every((m: Mob) => m.guard?.id !== id));
    assert.ok(c.grants.some(([item]) => item === 110));
  } finally {
    c.clearMobs();
    next.clearMobs();
  }
});

test("A natural castle chest grants its named loot once; an emptied or player-placed chest remains empty after reload", () => {
  const c = game(),
    next = game();
  try {
    const p = c.castle.loot[2].p,
      key = `overworld:${p}`;
    c.g.ensure(p[0], p[2]);
    assert.equal(c.world.get(...p), 61);
    c.adventure.openChest(...p);
    assert.deepEqual(c.adventure.data.storage[key], castleLoot(c.castle, ...p));
    c.adventure.setChestSlots(Array(27).fill(null));
    c.adventure.openChest(...p);
    assert.deepEqual(c.adventure.data.storage[key], {});
    assert.equal(c.adventure.data.opened, 1);
    next.adventure.restore(JSON.parse(JSON.stringify(c.adventure.data)));
    next.adventure.openChest(...p);
    assert.deepEqual(next.adventure.data.storage[key], {});
    assert.equal(next.adventure.data.opened, 1);
    const placed = c.castle.loot[0].p,
      placedKey = `overworld:${placed}`;
    c.world.edits[placedKey] = 61;
    c.adventure.openChest(...placed);
    assert.deepEqual(c.adventure.data.storage[placedKey], {});
  } finally {
    c.clearMobs();
    next.clearMobs();
  }
});

test("Locate castle marks a generated gate and creative teleport lands on its walkable approach", () => {
  const c = game();
  try {
    const before = c.g.position.clone();
    c.adventure.locateCastle(false);
    assert.deepEqual(c.g.position.toArray(), before.toArray());
    const waypoint = c.adventure.data.waypoint!;
    assert.equal(waypoint.x, c.castle.entrance[0]);
    assert.equal(waypoint.z, c.castle.entrance[2] + 8);
    c.adventure.locateCastle(true);
    assert.equal(c.g.position.x, waypoint.x + 0.5);
    assert.equal(c.g.position.z, waypoint.z + 0.5);
    assert.equal(c.world.solid(c.g.position.x, c.g.position.y, c.g.position.z), false);
    assert.equal(c.world.solid(c.g.position.x, c.g.position.y + 1.75, c.g.position.z), false);
    assert.equal(c.world.solid(c.g.position.x, c.g.position.y - 0.2, c.g.position.z), true);
    const [x, y, z] = c.castle.entrance;
    c.g.ensure(x, z);
    assert.equal(c.world.get(x, y + 1, z - 3), 0, "open gate through the south curtain");
    assert.ok(c.g.mobs.some((m: Mob) => m.kind === "knight"));
    c.g.mode = "survival";
    c.g.position.set(8, 20, 22);
    c.adventure.locateCastle(true);
    assert.deepEqual(c.g.position.toArray(), [8, 20, 22]);
  } finally {
    c.clearMobs();
  }
});
