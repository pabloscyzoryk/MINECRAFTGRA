import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Dragon } from "../lib/entities";
import { DRAGON_MAX_HEALTH, restoreDragonHealth } from "../lib/dragon-balance";
import { Room } from "../server/room";

test("Dragon health doubles and old saves keep their defeated state and fraction of health", () => {
  assert.equal(new Dragon().hp, 600);
  assert.equal(restoreDragonHealth(300), 600);
  assert.equal(restoreDragonHealth(150), 300);
  assert.equal(restoreDragonHealth(420, 600), 420);
  assert.equal(restoreDragonHealth(300, 300, true), 0);
  assert.equal(restoreDragonHealth(NaN), 600);
  assert.equal(restoreDragonHealth(700, 600), 600);
  const room = new Room(() => {}),
    save = room.save();
  room.dragon.hp = 420;
  const restored = new Room(() => {});
  restored.restore(room.save());
  assert.equal(restored.dragon.hp, 420);
  delete (save.dragon as any).maxHp;
  save.dragon.hp = 180;
  restored.restore(save);
  assert.equal(restored.dragon.hp, 360);
  save.won = true;
  save.dragon.dead = true;
  save.dragon.hp = 0;
  restored.restore(save);
  assert.equal(restored.dragon.hp, 0);
  assert.equal(restored.won, true);
});

test("Crystals heal the larger health pool and destroying them stops regeneration", () => {
  const dragon = new Dragon();
  dragon.hp = 500;
  const far = new THREE.Vector3(1000, 0, 0);
  dragon.update(1, 8, far, () => {});
  assert.equal(dragon.hp, 503.2);
  dragon.update(1, 0, far, () => {});
  assert.equal(dragon.hp, 503.2);
  dragon.hp = 599;
  dragon.update(1, 8, far, () => {});
  assert.equal(dragon.hp, DRAGON_MAX_HEALTH);
});

test("Fury below half health uses stronger faster triple volleys with distinct dodgeable targets", () => {
  const fire = (hp: number) => {
    const dragon = new Dragon();
    dragon.hp = hp;
    const shots: { origin: THREE.Vector3; power: number; speed: number; aim: THREE.Vector3 }[] = [];
    dragon.update(0.05, 0, new THREE.Vector3(0, 20, 0), (origin, power, speed, aim) =>
      shots.push({ origin, power: power!, speed: speed!, aim: aim! }),
    );
    return { dragon, shots };
  };
  const normal = fire(600),
    fury = fire(299);
  assert.equal(normal.shots.length, 2);
  assert.equal(fury.shots.length, 3);
  assert.deepEqual(
    normal.shots[0].aim.toArray(),
    [0, 21, 0],
    "The normal volley must threaten a stationary player",
  );
  assert(fury.dragon.shot < normal.dragon.shot);
  assert(fury.shots[0].power > normal.shots[0].power);
  assert(fury.shots[0].speed > normal.shots[0].speed);
  assert(fury.shots[0].aim.distanceTo(fury.shots[1].aim) > 2);
  assert(fury.shots[1].aim.distanceTo(fury.shots[2].aim) > 2);
  const before = fury.dragon.orbit;
  fury.dragon.hp = 301;
  fury.dragon.update(0.05, 0, new THREE.Vector3(1000, 0, 0), () => {});
  assert(
    Math.abs(fury.dragon.orbit - before) < 0.02,
    "Fury transition must not teleport along the orbit",
  );
});

test("Server projectiles retain dragon power and speed while ordinary enemies keep their existing values", () => {
  const room = new Room(() => {});
  room.join("test", "DragonTest", undefined);
  const player = room.players.get("test")!,
    origin = new THREE.Vector3(5, 30, 0),
    aim = new THREE.Vector3(0, 21, 0);
  room.enemyShot("end", origin, player, 7, 17, aim);
  assert.equal(room.shots[0].power, 7);
  assert(Math.abs(room.shots[0].v.length() - 17) < 1e-8);
  assert.deepEqual(aim.toArray(), [0, 21, 0]);
  room.enemyShot("overworld", origin, player);
  assert.equal(room.shots[1].power, 4);
  assert(Math.abs(room.shots[1].v.length() - 12) < 1e-8);
});
