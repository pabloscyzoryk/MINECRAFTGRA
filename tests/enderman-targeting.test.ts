import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Room } from "../server/room";
import { Mob } from "../lib/entities";

function flat(room: Room, mob: Mob) {
  room.populate = () => {};
  const world = room.region("overworld").world;
  world.solid = (_x, y) => y < 50;
  world.surface = () => 50;
  world.get = (_x, y) => (y < 50 ? 3 : 0);
  mob.group.position.set(40, 50, 46);
  mob.group.rotation.set(0, 0, 0);
  mob.heading = Math.PI;
  mob.speed = 0;
  mob.timer = 100;
}

function setup() {
  let now = 100000;
  const room = new Room(
    () => {},
    () => now,
  );
  const mob = new Mob("enderman", 40, 46, room.region("overworld").world);
  room.region("overworld").mobs.set("enderman", mob);
  flat(room, mob);
  room.join("innocent", "Kolega", undefined);
  room.join("provoker", "Prowokator", undefined);
  const innocent = room.players.get("innocent")!,
    provoker = room.players.get("provoker")!;
  Object.assign(innocent, {
    p: [40.8, 50, 45.5],
    active: true,
    yaw: Math.PI / 2,
    pitch: -1,
    spawnUntil: 0,
    healed: now,
  });
  Object.assign(provoker, {
    p: [40, 50, 43],
    active: true,
    yaw: Math.PI,
    pitch: -1,
    spawnUntil: 0,
    healed: now,
  });
  return {
    room,
    mob,
    innocent,
    provoker,
    clock: () => now,
    step(dt = 0.1) {
      now += dt * 1000;
      room.tick(dt);
    },
    aimEyes() {
      mob.head.updateWorldMatrix(true, false);
      const eyes = mob.eyes[0].position
        .clone()
        .add(mob.eyes[1].position)
        .multiplyScalar(0.5)
        .applyMatrix4(mob.head.matrixWorld);
      const direction = eyes
        .sub(new THREE.Vector3(...provoker.p).add(new THREE.Vector3(0, 1.62, 0)))
        .normalize();
      provoker.yaw = Math.atan2(-direction.x, -direction.z);
      provoker.pitch = Math.asin(direction.y);
    },
    hit() {
      room.command("provoker", { type: "hit", target: "enderman", req: "melee" });
    },
    impact() {
      mob.attackClock = 0.4;
      mob.attackCooldown = 5;
      this.step(0.1);
    },
  };
}

test("Eye-provoked Enderman keeps attacking the observer when an innocent player is closer", () => {
  const c = setup();
  try {
    for (let i = 0; i < 3; i++) {
      c.aimEyes();
      c.step();
    }
    assert.equal(c.mob.anger, 30);
    assert.equal(c.mob.angerTarget, "provoker");
    c.provoker.pitch = -1;
    c.provoker.p = [40, 50, 44];
    c.impact();
    assert.equal(c.provoker.health, 16);
    assert.equal(c.innocent.health, 20);
    assert.equal(c.mob.angerTarget, "provoker");
  } finally {
    c.mob.dispose();
  }
});

test("The melee command records its attacker and a pending Enderman strike never retargets a nearer bystander", () => {
  const c = setup();
  try {
    c.hit();
    assert(c.mob.hp < 40);
    assert.equal(c.mob.angerTarget, "provoker");
    c.impact();
    assert.equal(
      c.innocent.health,
      20,
      "A target outside melee range must not be replaced by a nearby victim",
    );
    assert.equal(c.provoker.health, 20);
    c.provoker.p = [40, 50, 44];
    c.impact();
    assert.equal(c.provoker.health, 16);
    assert.equal(c.innocent.health, 20);
  } finally {
    c.mob.dispose();
  }
});

test("A real server bow projectile binds Enderman aggression to its owner instead of a nearer player", () => {
  const c = setup();
  try {
    c.provoker.held = 105;
    c.provoker.profile.inventory = { 105: 1, 113: 2 };
    const direction = c.mob.group.position
      .clone()
      .add(new THREE.Vector3(0, 1, 0))
      .sub(new THREE.Vector3(...c.provoker.p).add(new THREE.Vector3(0, 1.55, 0)))
      .normalize();
    c.room.command("provoker", { type: "shoot", direction: direction.toArray(), req: "arrow" });
    assert.equal(c.room.shots.length, 1);
    c.step(0.05);
    c.step(0.05);
    assert.equal(c.room.shots.length, 0);
    assert.equal(c.mob.hp, 20);
    assert.equal(c.mob.angerTarget, "provoker");
    assert.equal(c.innocent.health, 20);
    c.provoker.p = [40, 50, 44];
    c.impact();
    assert.equal(c.provoker.health, 16);
    assert.equal(c.innocent.health, 20);
  } finally {
    c.mob.dispose();
  }
});

test("Missing, dead or dimension-changed provokers cancel aggression and pending impact without harming the remaining player", () => {
  for (const missing of ["disconnect", "expired", "dead", "dimension", "deleted"] as const) {
    const c = setup();
    try {
      c.hit();
      if (missing === "disconnect") c.provoker.seen = 0;
      if (missing === "expired") c.provoker.seen = c.clock() - 13000;
      if (missing === "dead") c.provoker.health = 0;
      if (missing === "dimension") c.provoker.dimension = "nether";
      if (missing === "deleted") c.room.players.delete("provoker");
      c.impact();
      assert.equal(c.mob.anger, 0, missing);
      assert.equal(c.mob.angerTarget, "", missing);
      assert.equal(c.mob.eyeContact, 0, missing);
      assert.equal(c.mob.attackClock, 0, missing);
      assert.equal(c.innocent.health, 20, missing);
    } finally {
      c.mob.dispose();
    }
  }
});

test("Anger expiry and Enderman death clear the remembered provoker", () => {
  const c = setup();
  try {
    c.hit();
    c.mob.anger = 0.05;
    c.impact();
    assert.equal(c.mob.anger, 0);
    assert.equal(c.mob.angerTarget, "");
    assert.equal(c.mob.attackClock, 0);
    assert.equal(c.innocent.health, 20);
    c.room.hitMob(c.provoker, c.mob, 1);
    assert.equal(c.mob.angerTarget, "provoker");
    c.mob.die();
    assert.equal(c.mob.angerTarget, "");
  } finally {
    c.mob.dispose();
  }
});

test("Restored provocation survives the initial reconnect gap but cannot hit a bystander or grant a second disconnect grace", () => {
  const c = setup(),
    restored = new Room(() => {}, c.clock);
  try {
    c.hit();
    c.mob.anger = 7;
    restored.restore(c.room.save());
    const mob = restored.region("overworld").mobs.get("enderman")!;
    flat(restored, mob);
    const innocent = restored.players.get("innocent")!,
      provoker = restored.players.get("provoker")!;
    restored.join("innocent", "Kolega", undefined);
    Object.assign(innocent, { active: true, spawnUntil: 0 });
    mob.attackClock = 0.4;
    restored.tick(0.1);
    assert.equal(mob.angerTarget, "provoker");
    assert.equal(mob.anger, 6.9);
    assert.equal(mob.attackClock, 0);
    assert.equal(innocent.health, 20);
    restored.join("provoker", "Prowokator", undefined);
    Object.assign(provoker, { p: [40, 50, 44], active: true, spawnUntil: 0 });
    mob.attackClock = 0.4;
    restored.tick(0.1);
    assert.equal(provoker.health, 16);
    assert.equal(innocent.health, 20);
    provoker.seen = 0;
    mob.attackClock = 0.4;
    restored.tick(0.1);
    assert.equal(mob.anger, 0);
    assert.equal(mob.angerTarget, "");
    assert.equal(innocent.health, 20);
  } finally {
    c.mob.dispose();
    for (const mob of restored.region("overworld").mobs.values()) mob.dispose();
  }
});

test("A saved target that never reconnects loses its restore grace after twelve seconds", () => {
  const c = setup();
  let now = c.clock();
  const restored = new Room(
    () => {},
    () => now,
  );
  try {
    c.hit();
    restored.restore(c.room.save());
    const mob = restored.region("overworld").mobs.get("enderman")!;
    flat(restored, mob);
    restored.tick(0.1);
    assert.equal(mob.angerTarget, "provoker");
    now += 12001;
    restored.tick(0.1);
    assert.equal(mob.angerTarget, "");
    assert.equal(mob.anger, 0);
  } finally {
    c.mob.dispose();
    for (const mob of restored.region("overworld").mobs.values()) mob.dispose();
  }
});
