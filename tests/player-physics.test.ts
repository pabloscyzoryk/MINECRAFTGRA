import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Game } from "../lib/engine";
import { clearDamagePath, fallDamage, moveVertical } from "../lib/player-physics";

test("Swept falling lands on the exact top of a thin floor, without rewinding or tunneling", () => {
  const p = new THREE.Vector3(0, 6.72, 0);
  const result = moveVertical(p, -3.8, (p) => p.y < 5 && p.y > 4);
  assert.equal(result.landed, true);
  assert(p.y >= 5 && p.y < 5.00001);
  assert(Math.abs(result.distance - 1.72) < 0.00001);
  const y = p.y;
  for (let i = 0; i < 30; i++) moveVertical(p, -0.04, (p) => p.y < 5);
  assert(Math.abs(p.y - y) < 0.00001, "Grounded camera does not bounce on subsequent frames");
});
test("Ceiling collision resolves against the head and never counts as a landing", () => {
  const p = new THREE.Vector3(0, 2, 0);
  const result = moveVertical(p, 2, (p) => p.y + 1.75 > 4);
  assert.equal(result.landed, false);
  assert.equal(result.hit, true);
  assert.equal(result.distance, 0);
  assert(p.y <= 2.25 && p.y > 2.24999);
});
test("Steady ground contact is a single cheap probe; walking off a ledge starts falling", () => {
  const p = new THREE.Vector3(0, 5.000001, 0);
  let reads = 0;
  const ground = (p: THREE.Vector3) => {
    reads++;
    return p.y < 5;
  };
  for (let i = 0; i < 100; i++) assert.equal(moveVertical(p, -0.02, ground, true).landed, true);
  assert.equal(reads, 100);
  assert.equal(p.y, 5.000001);
  assert.equal(moveVertical(p, -0.2, () => false, true).landed, false);
  assert(p.y < 4.81);
});
test("Fall damage measures descent independent of frame rate and keeps three-block falls safe", () => {
  for (const height of [1.4, 3, 4, 6])
    for (const dt of [1 / 144, 1 / 60, 1 / 20]) {
      const p = new THREE.Vector3(0, 10 + height, 0);
      let speed = 0,
        total = 0,
        landed = false;
      for (let i = 0; i < 1000 && !landed; i++) {
        speed -= 24 * dt;
        const result = moveVertical(p, speed * dt, (p) => Math.floor(p.y + 0.00001) < 10);
        total += result.distance;
        landed = result.landed;
      }
      assert(landed);
      assert.equal(
        fallDamage(total),
        Math.max(0, Math.ceil(height - 3)),
        `height ${height}, dt ${dt}`,
      );
    }
  assert.equal(fallDamage(NaN), 0);
});

function gameFixture() {
  const g = Object.create(Game.prototype) as Game;
  const notices: string[] = [],
    requests: any[] = [];
  Object.assign(g, {
    health: 20,
    damageTimer: 0,
    difficulty: "normal",
    mode: "survival",
    net: null,
    adventure: { data: { armor: 0 } },
    audio: { play() {} },
    emit() {},
    notify(s: string) {
      notices.push(s);
    },
    position: new THREE.Vector3(0, 3, 0),
    eyeHeight: 1.62,
    yaw: 0,
    pitch: 0,
    world: { solid: () => false },
  });
  return { g, notices, requests };
}
test("Actual SP damage cannot cross a solid wall; an open line still hurts and explains why", () => {
  const { g, notices } = gameFixture(),
    source = new THREE.Vector3(0, 4.4, -2);
  g.world.solid = (_x, _y, z) => Math.floor(z) === -1;
  assert.equal(clearDamagePath(source, g.playerEyeRay().origin, g.world.solid), false);
  g.damageFrom(2, source, "mob");
  assert.equal(g.health, 20);
  assert.equal(notices.length, 0);
  g.world.solid = () => false;
  g.damageFrom(2, source, "mob");
  assert.equal(g.health, 18);
  assert.equal(notices.length, 1);
  g.damageTimer = 0;
  g.damage(2, "lava");
  assert.equal(g.health, 16);
  assert.equal(notices.length, 1, "Damage notices are throttled");
});
test("Invalid and zero damage do not become phantom one-heart hits", () => {
  const { g, notices } = gameFixture();
  for (const amount of [0, -1, NaN, Infinity]) g.damage(amount, "fall");
  assert.equal(g.health, 20);
  assert.equal(notices.length, 0);
});
test("Online environmental damage waits for authoritative health and sends raw cause once for server armor", () => {
  const { g, notices, requests } = gameFixture();
  g.adventure.data.armor = 122;
  g.net = { connected: true, request: (request: any) => requests.push(request) } as any;
  g.damage(4, "fall");
  g.damage(4, "fall");
  assert.equal(g.health, 20);
  assert.equal(notices.length, 0);
  assert.deepEqual(requests, [{ type: "environmentDamage", amount: 4, reason: "fall" }]);
  g.damageTimer = 0;
  g.damage(2, "mob");
  g.damage(1, "hunger");
  assert.equal(
    requests.length,
    1,
    "Server AI and hunger cannot be predicted as environment damage",
  );
});
test("All four armor pieces protect against attacks, but do not soften drowning or falls", () => {
  const { g } = gameFixture();
  g.adventure.data.equipment = { head: 152, chest: 122, legs: 153, feet: 154 };
  g.damage(10, "mob");
  assert.equal(g.health, 18);
  g.damageTimer = 0;
  g.damage(4, "fall");
  assert.equal(g.health, 14);
  g.damageTimer = 0;
  g.damage(2, "drowning");
  assert.equal(g.health, 12);
});
