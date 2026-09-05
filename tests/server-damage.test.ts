import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Room } from "../server/room";
import { Mob, type MobKind } from "../lib/entities";

function setup() {
  let now = 100000;
  const messages: { id: string; data: any }[] = [],
    room = new Room(
      (id, data) => messages.push({ id, data }),
      () => now,
    );
  room.populate = () => {};
  room.join("a", "Alicja", undefined);
  const player = room.players.get("a")!;
  player.p = [20.2, 50, 20.5];
  player.active = true;
  player.spawnUntil = 0;
  const world = room.region("overworld").world;
  for (let x = 18; x <= 30; x++)
    for (let z = 18; z <= 23; z++) {
      world.set(x, 49, z, 3);
      for (let y = 50; y <= 55; y++) world.set(x, y, z, 0);
    }
  return {
    room,
    messages,
    player,
    world,
    step(dt = 0.05) {
      now += dt * 1000;
      player.seen = now;
      room.tick(dt);
    },
    time(dt: number) {
      now += dt * 1000;
    },
    wall(solid: boolean) {
      for (let y = 50; y <= 54; y++) world.set(21, y, 20, solid ? 3 : 0);
    },
    mob(kind: MobKind, x = 22.2) {
      const mob = new Mob(kind, x, 20.5, world);
      mob.group.position.set(x, 50, 20.5);
      mob.attackClock = 0.35;
      mob.attackCooldown = 3;
      room.region("overworld").mobs.set("fixture", mob);
      return mob;
    },
  };
}

test("A stale profile health value after regeneration cannot cause phantom damage", () => {
  const s = setup();
  s.player.health = 16;
  s.room.profile("a", { health: 14, inventory: {}, food: 2 });
  assert.equal(s.player.health, 16);
  assert.equal(s.player.profile.health, 16);
  assert.equal(
    s.messages.some((m) => m.data.type === "damage"),
    false,
  );
  s.room.profile("a", { health: 0 });
  assert.equal(s.player.health, 16);
});

test("Explicit local hazard commands apply once, preserve difficulty scaling and label the cause", () => {
  const s = setup();
  const command = { type: "environmentDamage", amount: 4, reason: "fall", req: "landing" };
  s.room.command("a", command);
  assert.equal(s.player.health, 16);
  assert.equal(s.messages.find((m) => m.data.type === "damage")!.data.reason, "fall");
  s.time(1);
  s.room.command("a", command);
  assert.equal(s.player.health, 16);
  for (const invalid of [{ amount: NaN }, { amount: 999 }, { reason: "mob" }, { amount: -2 }])
    s.room.command("a", { ...command, ...invalid, req: JSON.stringify(invalid) });
  assert.equal(s.player.health, 16);
  s.room.command("a", { type: "difficulty", difficulty: "hard", req: "hard" });
  s.room.command("a", { ...command, reason: "lava", req: "lava" });
  assert(s.player.health < 12);
});

test("A nearby mob cannot strike through a solid wall, but open contact still damages with a cause", () => {
  const s = setup(),
    mob = s.mob("zombie");
  s.wall(true);
  s.step();
  assert.equal(s.player.health, 20);
  s.wall(false);
  mob.attackClock = 0.35;
  s.step();
  assert.equal(s.player.health, 18);
  assert.equal(s.messages.find((m) => m.data.type === "damage")!.data.reason, "mob");
  assert(s.room.frame().mobs.overworld!.some((m) => m.id === "fixture"));
});

test("A ranged mob cannot create a projectile through a wall", () => {
  const s = setup(),
    mob = s.mob("skeleton", 28);
  mob.rangedAttack = true;
  s.wall(true);
  s.step();
  assert.equal(s.room.shots.length, 0);
  s.wall(false);
  mob.attackClock = 0.35;
  s.step();
  assert.equal(s.room.shots.length, 1);
});

test("Creeper damage checks shelter before destroying the nearby blocks", () => {
  for (const wall of [true, false]) {
    const s = setup(),
      mob = s.mob("creeper");
    mob.fuse = 1.31;
    mob.attackClock = 0;
    s.wall(wall);
    s.step();
    assert.equal(s.player.health, wall ? 20 : 12);
    if (!wall)
      assert.equal(s.messages.find((m) => m.data.type === "damage")!.data.reason, "explosion");
  }
});

test("Expired enemy projectiles cannot damage a player at their final position", () => {
  const s = setup();
  s.room.shots.push({
    p: new THREE.Vector3(20.2, 51, 20.5),
    v: new THREE.Vector3(),
    owner: "",
    dimension: "overworld",
    life: 0.01,
  });
  s.step();
  assert.equal(s.player.health, 20);
  assert.equal(s.room.shots.length, 0);
});

test("Enemy projectiles hitting or crossing a wall stop before damage, including fast movement", () => {
  for (const speed of [11, 48]) {
    const s = setup();
    s.wall(true);
    s.room.shots.push({
      p: new THREE.Vector3(speed === 11 ? 21.6 : 22.6, 51, 20.5),
      v: new THREE.Vector3(-speed, 0, 0),
      owner: "",
      dimension: "overworld",
      life: 6,
    });
    s.step();
    assert.equal(s.player.health, 20);
    assert.equal(s.room.shots.length, 0);
  }
});

test("A valid visible enemy projectile still damages and labels the attack", () => {
  const s = setup();
  s.room.shots.push({
    p: new THREE.Vector3(20.8, 51, 20.5),
    v: new THREE.Vector3(-12, 0, 0),
    owner: "",
    dimension: "overworld",
    life: 6,
  });
  s.step();
  assert.equal(s.player.health, 16);
  assert.equal(s.messages.find((m) => m.data.type === "damage")!.data.reason, "projectile");
});

test("Projectiles orphaned by disconnect or dimension travel cannot hit another player", () => {
  for (const dimension of ["end", "overworld"] as const) {
    const s = setup();
    s.room.join("b", "Bartek", undefined);
    const owner = s.room.players.get("b")!;
    owner.dimension = dimension;
    if (dimension === "overworld") owner.seen = 0;
    s.room.shots.push({
      p: new THREE.Vector3(20.2, 51, 20.5),
      v: new THREE.Vector3(),
      owner: "b",
      dimension: "overworld",
      life: 5,
    });
    s.step();
    assert.equal(s.player.health, 20);
    assert.equal(s.room.shots.filter((shot) => shot.owner === "b").length, 0);
  }
});
