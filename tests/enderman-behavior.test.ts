import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Mob, type MobObserver } from "../lib/entities";
import type { World } from "../lib/world";

const world = { surface: () => 10, get: () => 0, solid: () => false } as unknown as World;
function fixture(kind: "enderman" | "zombie" = "enderman") {
  const mob = new Mob(kind, 0, 0, world);
  mob.elapsed = 1.2;
  mob.heading = Math.PI;
  mob.timer = 999;
  mob.group.rotation.y = 0;
  let hits = 0,
    shots = 0;
  const player = new THREE.Vector3(0, 10, -1.5);
  const step = (dt: number, observer?: MobObserver, terrain = world) =>
    mob.update(
      dt,
      0,
      player,
      terrain,
      () => hits++,
      () => shots++,
      () => {},
      observer,
    );
  return { mob, player, step, hits: () => hits, shots: () => shots };
}

test("New Endermen continue to wander and look at a nearby player without attacking", () => {
  const f = fixture();
  const spawn = f.mob.group.position.clone();
  for (let i = 0; i < 200; i++) {
    f.player.copy(f.mob.group.position).add(new THREE.Vector3(0, 0, -1.5));
    f.step(0.05);
    assert.equal(f.mob.attackClock, 0);
    assert.equal(f.mob.anger, 0);
  }
  assert(f.mob.group.position.distanceTo(spawn) > 1, "neutral means wandering rather than frozen");
  assert.equal(f.hits(), 0);
  assert.equal(f.shots(), 0);
  f.mob.dispose();
});

test("A real damage flash provokes an Enderman and its timed strike points towards the attacker", () => {
  const f = fixture();
  f.mob.speed = 0;
  f.mob.hurt = 0.3; // Existing Game.hitMob and Room.mobHit use this exact assignment.
  assert.equal(f.mob.anger, 30);
  f.step(0);
  assert.equal(f.mob.attackClock, 0.65);
  f.step(0.15);
  assert.equal(f.hits(), 0);
  f.mob.group.updateMatrixWorld(true);
  const raised = f.mob.hands[0].getWorldPosition(new THREE.Vector3());
  f.step(0.161);
  assert.equal(f.hits(), 1);
  f.mob.group.updateMatrixWorld(true);
  const contact = f.mob.hands[0].getWorldPosition(new THREE.Vector3());
  assert(contact.z < raised.z - 0.2 && contact.y < raised.y - 0.3);
  assert(f.mob.anger < 30 && f.mob.anger > 29.6, "decaying hurt flash cannot renew anger");
  f.mob.dispose();
});

test("Provocation expires after 30 seconds away and returning to melee range does not restart it", () => {
  const f = fixture();
  f.mob.speed = 0;
  f.mob.hurt = 0.3;
  f.player.set(60, 10, 0);
  for (let i = 0; i < 601; i++) f.step(0.05);
  assert.equal(f.mob.anger, 0);
  f.player.set(0, 10, -1.5);
  for (let i = 0; i < 40; i++) f.step(0.05);
  assert.equal(f.hits(), 0);
  assert.equal(f.mob.attackClock, 0);
  f.mob.hurt = 0.3;
  assert.equal(f.mob.anger, 30, "a new hit can provoke it again");
  f.mob.die();
  assert.equal(f.mob.anger, 0);
  f.mob.hurt = 0.5;
  assert.equal(f.mob.anger, 0, "death cannot revive aggression");
  f.mob.dispose();
});

test("An expired or legacy unprovoked attack is cancelled before it can deal a hidden hit", () => {
  const f = fixture();
  f.mob.speed = 0;
  for (const remainingAnger of [0, 0.01]) {
    f.mob.anger = remainingAnger;
    f.mob.attackClock = 0.35;
    f.step(0.02);
    assert.equal(f.mob.attackClock, 0);
    assert.equal(f.hits(), 0);
  }
  f.mob.dispose();
});

test("Ordinary hostile mobs still attack on proximity without any provocation timer", () => {
  const f = fixture("zombie");
  f.mob.speed = 0;
  f.step(0);
  assert.equal(f.mob.attackClock, 0.65);
  f.step(0.32);
  assert.equal(f.hits(), 1);
  assert.equal(f.mob.anger, 0);
  f.mob.dispose();
});

function eyeRay(mob: Mob, origin = new THREE.Vector3(0, 11.62, -4)) {
  mob.group.updateMatrixWorld(true);
  const eye = mob.eyes[0]
    .getWorldPosition(new THREE.Vector3())
    .add(mob.eyes[1].getWorldPosition(new THREE.Vector3()))
    .multiplyScalar(0.5);
  return new THREE.Ray(origin.clone(), eye.sub(origin).normalize());
}

test("Only a sustained direct look into the animated eyes provokes a neutral Enderman", () => {
  const f = fixture();
  f.mob.speed = 0;
  f.player.set(0, 10, -4);
  f.step(0.249, eyeRay(f.mob));
  assert.equal(f.mob.anger, 0);
  assert.equal(f.mob.eyeContact, 0.249);
  f.step(0.002, eyeRay(f.mob));
  assert.equal(f.mob.anger, 30);
  assert.equal(f.mob.eyeContact, 0.25);
  f.mob.dispose();
});

test("Brief glances, torso aiming, looking away/back of head, distance and solid walls do not provoke", () => {
  for (const mode of ["brief", "torso", "away", "back", "distant", "wall"] as const) {
    const f = fixture();
    f.mob.speed = 0;
    f.player.set(0, 10, -4);
    const terrain =
      mode === "wall"
        ? ({
            ...world,
            solid: (_x: number, _y: number, z: number) => z > -2.2 && z < -1.2,
          } as World)
        : world;
    for (let i = 0; i < 30; i++) {
      const origin = new THREE.Vector3(
        0,
        11.62,
        mode === "back" ? 4 : mode === "distant" ? -25 : -4,
      );
      const ray = eyeRay(f.mob, origin);
      if (mode === "torso") ray.direction.copy(new THREE.Vector3(0, 11, 0).sub(origin).normalize());
      if (mode === "away" || (mode === "brief" && i % 4 === 3)) ray.direction.set(1, 0, 0);
      f.step(0.05, ray, terrain);
    }
    assert.equal(f.mob.anger, 0, mode);
    assert.equal(f.hits(), 0, mode);
    f.mob.dispose();
  }
});

test("Player eye rays and equivalent server observer rays produce the same provocation regardless of display view", () => {
  const solo = fixture(),
    online = fixture();
  solo.mob.speed = online.mob.speed = 0;
  solo.player.set(0, 10, -4);
  online.player.copy(solo.player);
  for (let i = 0; i < 6; i++) {
    const ray = eyeRay(solo.mob);
    const yaw = Math.atan2(-ray.direction.x, -ray.direction.z),
      pitch = Math.asin(ray.direction.y);
    const authoritative = {
      origin: ray.origin.clone(),
      direction: new THREE.Vector3(
        -Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        -Math.cos(yaw) * Math.cos(pitch),
      ),
    };
    solo.step(0.05, ray);
    online.step(0.05, authoritative);
    assert.equal(solo.mob.eyeContact, online.mob.eyeContact);
    assert.equal(solo.mob.anger, online.mob.anger);
  }
  assert.equal(solo.mob.anger, 30);
  solo.mob.dispose();
  online.mob.dispose();
});
