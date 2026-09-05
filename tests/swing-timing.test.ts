import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { SWING_DURATION, handSwing } from "../lib/interaction-effects";
import { Game } from "../lib/engine";
import { Multiplayer } from "../lib/multiplayer";
import { weapon } from "../lib/combat";

test("SP and MP strikes use the same fast animation while weapon cooldowns stay distinct", () => {
  const game = Object.create(Game.prototype) as Game;
  const target = new THREE.Group();
  target.position.set(0, 1.62, -2);
  Object.assign(game, {
    position: new THREE.Vector3(),
    eyeHeight: 1.62,
    yaw: 0,
    pitch: 0,
    selected: 0,
    hotbar: [104],
    attackCooldown: 0,
    net: null,
    target: null,
    mobs: [],
    crystals: [{ alive: true, mesh: target }],
    dragon: null,
    destroyCrystal() {},
    world: { dimension: "overworld" },
  });
  const net = Object.create(Multiplayer.prototype) as Multiplayer;
  Object.assign(net, { game, remotes: new Map(), request() {} });
  for (const id of [104, 127, 129]) {
    game.hotbar[0] = id;
    game.attackCooldown = 0;
    assert(game.attack());
    assert.equal(game.swingTime, 0.23);
    assert.equal(game.attackCooldown, weapon(id).cooldown);
    game.attackCooldown = 0;
    assert(net.attack());
    assert.equal(game.swingTime, SWING_DURATION);
    assert.equal(game.attackCooldown, weapon(id).cooldown);
  }
  assert.notEqual(weapon(104).cooldown, weapon(127).cooldown);
});

test("Remote third-person pose completes in 0.23 seconds and shares the forward downstroke", () => {
  const phases: number[] = [];
  const net = Object.create(Multiplayer.prototype) as Multiplayer;
  const remote = {
    model: {
      group: new THREE.Group(),
      head: new THREE.Group(),
      pose(_t: number, _moving: boolean, _crouch: boolean, progress: number) {
        phases.push(progress);
      },
    },
    position: new THREE.Vector3(),
    label: { visible: true },
    swingTime: SWING_DURATION,
    wire: { dimension: "overworld", yaw: 0, pitch: 0, moving: false, crouch: false },
  };
  Object.assign(net, {
    game: { world: { dimension: "overworld" } },
    closed: false,
    connected: false,
    refreshFurnace() {},
    flushInventory() {},
    emit() {},
    send() {},
    sendProfile() {},
    clock: 0,
    horrorClock: 0,
    networkClock: 0,
    profileClock: 0,
    uiClock: 0,
    remotes: new Map([["other", remote]]),
    entities: new Map(),
    lastFrame: null,
  });
  net.tick(SWING_DURATION * 0.2);
  assert(Math.abs(phases.at(-1)! - 0.2) < 1e-12);
  const windup = handSwing(phases.at(-1)!);
  net.tick(SWING_DURATION * 0.45);
  assert(Math.abs(phases.at(-1)! - 0.65) < 1e-12);
  const impact = handSwing(phases.at(-1)!);
  assert(impact.y < windup.y && impact.z < windup.z);
  net.tick(SWING_DURATION * 0.35 + 1e-12);
  assert.equal(remote.swingTime, 0);
  assert.equal(phases.at(-1), -1);
});
