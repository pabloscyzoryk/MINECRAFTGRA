import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Game } from "../lib/engine";
import { World } from "../lib/world";
import { FluidSystem } from "../lib/fluid";
import { DEFAULT_SETTINGS } from "../lib/settings";

function browser(run: () => void) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { matchMedia: () => ({ matches: false }) },
  });
  try {
    run();
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
}
function fixture(dx = 1, dz = 0, bankHeight = 1, ceiling = false) {
  const world = new World();
  world.chunk(0, 0);
  for (let x = 3; x <= 13; x++)
    for (let z = 3; z <= 13; z++)
      for (let y = 46; y <= 57; y++) {
        const bank = (x - 8) * dx + (z - 8) * dz >= 1;
        world.set(
          x,
          y,
          z,
          y <= 47 || (bank && y < 50 + bankHeight) || (ceiling && y === 52)
            ? 3
            : !bank && y <= 50
              ? 7
              : 0,
        );
      }
  const game = Object.create(Game.prototype) as Game;
  Object.assign(game, {
    world,
    fluid: new FluidSystem(world),
    position: new THREE.Vector3(8.5, 50.15, 8.5),
    velocity: new THREE.Vector3(),
    keys: new Set(["KeyW", "Space"]),
    yaw: Math.atan2(-dx, -dz),
    pitch: 0,
    eyeHeight: 1.62,
    perspective: 0,
    camera: new THREE.PerspectiveCamera(),
    sun: new THREE.DirectionalLight(),
    torch: new THREE.PointLight(),
    audio: { play() {} },
    settings: { ...DEFAULT_SETTINGS },
    health: 20,
    food: 20,
    oxygen: 20,
    mode: "survival",
    difficulty: "normal",
    net: null,
    rest: null,
    horrorThreat: null,
    avatar: null,
    flying: false,
    grounded: false,
    crouching: false,
    sprinting: false,
    fallDistance: 0,
    hungerTimer: 0,
    regenerationTimer: 0,
    damageTimer: 0,
    damageFlash: 0,
    stepTimer: 0,
    clock: 90,
    time: 0,
    hotbar: [],
    selected: 0,
    adventure: { data: { equipment: { head: 0, chest: 0, legs: 0, feet: 0 } } },
    notify() {},
    emit() {},
  });
  const distance = () => (game.position.x - 8.5) * dx + (game.position.z - 8.5) * dz;
  const frame = (dt = 1 / 60, controls = true) => {
    game.move(dt, controls);
    assert(!game.collision(game.position), "Swept movement never overlaps bank or ceiling");
  };
  return { game, world, distance, frame };
}

test("Held jump and forward movement leave source water onto a full bank in all four directions and frame rates", () =>
  browser(() => {
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      for (const dt of [1 / 144, 1 / 60, 1 / 30, 0.045]) {
        const { game, distance, frame } = fixture(dx, dz);
        for (let i = 0; i < 4 / dt && distance() < 1.3; i++) frame(dt);
        assert(distance() >= 1.3, `Bank exit ${dx},${dz} at dt=${dt}`);
        game.keys.clear();
        for (let i = 0; i < 2 / dt; i++) frame(dt);
        assert(game.grounded);
        assert(Math.abs(game.position.y - 51) < 0.00002);
        assert.equal(game.health, 20);
      }
  }));

test("The extra stroke requires jump and movement controls, including while a cursor panel is open", () =>
  browser(() => {
    for (const controls of [true, false]) {
      const { game, distance, frame } = fixture();
      if (controls) game.keys.delete("Space");
      for (let i = 0; i < 180; i++) frame(1 / 60, controls);
      assert(distance() <= 0.211);
      assert(game.position.y < 51);
    }
    const { game, distance, frame } = fixture();
    game.keys.delete("KeyW");
    for (let i = 0; i < 180; i++) frame();
    assert.equal(distance(), 0);
    assert(game.position.y < 50.8, "Open-water buoyancy is unchanged");
  }));

test("A two-block wall and a low ceiling do not become a ladder or allow head clipping", () =>
  browser(() => {
    for (const [height, ceiling] of [
      [2, false],
      [1, true],
    ] as const) {
      const { game, distance, frame } = fixture(1, 0, height, ceiling);
      for (let i = 0; i < 360; i++) frame();
      assert(distance() <= 0.211);
      assert(game.position.y < 51);
    }
  }));

test("Shore assistance cannot step up a full block on dry land", () =>
  browser(() => {
    const { game, world, distance, frame } = fixture();
    for (let x = 3; x <= 13; x++)
      for (let z = 3; z <= 13; z++)
        for (let y = 48; y <= 50; y++)
          if (world.get(x, y, z) === 7) world.set(x, y, z, y < 50 ? 3 : 0);
    game.position.y = 50;
    game.grounded = true;
    game.keys.delete("Space");
    for (let i = 0; i < 120; i++) frame();
    assert(distance() <= 0.211);
    assert.equal(game.position.y, 50);
  }));

test("A shallow flowing-water surface can still supply a safe shore stroke", () =>
  browser(() => {
    const { game, world, distance, frame } = fixture();
    for (let x = 3; x < 9; x++)
      for (let z = 3; z <= 13; z++) world.waterLevels[`overworld:${x},50,${z}`] = 3;
    game.position.x = 8.7;
    game.position.y = 50.02;
    for (let i = 0; i < 240 && distance() < 1.3; i++) frame();
    assert(distance() >= 1.3);
  }));
