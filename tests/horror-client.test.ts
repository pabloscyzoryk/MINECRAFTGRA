import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Game } from "../lib/engine";
import { HorrorDirector, type HorrorEvent } from "../lib/horror-director";
import { DEFAULT_SETTINGS } from "../lib/settings";
import { InventoryPack } from "../lib/inventory";
import { Atmosphere } from "../lib/atmosphere";

function browserFlags(run: () => void) {
  const oldDocument = globalThis.document,
    oldWindow = globalThis.window;
  Object.assign(globalThis, {
    document: { hidden: false },
    window: { matchMedia: () => ({ matches: false }) },
  });
  try {
    run();
  } finally {
    Object.assign(globalThis, { document: oldDocument, window: oldWindow });
  }
}
function gameFixture() {
  const game = Object.create(Game.prototype) as Game;
  const events: HorrorEvent[] = [],
    updates: any[] = [];
  Object.assign(game, {
    difficulty: "horror",
    active: true,
    needsCapture: false,
    health: 20,
    net: null,
    position: new THREE.Vector3(0, 20, 0),
    yaw: 0,
    pitch: 0,
    clock: 0,
    world: { dimension: "overworld", surface: () => 20, solid: () => false },
    settings: structuredClone(DEFAULT_SETTINGS),
    horrorDirector: new HorrorDirector(4567),
    horror: {
      event: (event: HorrorEvent) => events.push(event),
      update: (_: number, value: unknown) => updates.push(value),
      clear() {},
    },
  });
  return { game, events, updates };
}

test("Single-player horror advances on real play time with a frozen day clock", () =>
  browserFlags(() => {
    const { game, events, updates } = gameFixture();
    game.settings.dayCycle = false;
    for (let i = 0; i < 180; i++) game.updateHorror(0.5);
    assert.equal(game.clock, 0);
    assert.equal(game.horrorDirector.elapsed, 90);
    assert.equal(updates.at(-1).time, 90);
    assert(events.some((event) => event.kind === "whisper"));
    assert(!events.some((event) => event.kind === "jumpscare"));
  }));

test("Paused, hidden, uncaptured or dead clients cannot accumulate personal horror progression", () =>
  browserFlags(() => {
    for (const condition of ["paused", "hidden", "uncaptured", "dead"]) {
      const { game, events, updates } = gameFixture();
      game.updateHorror(0.5);
      const age = game.horrorDirector.states.get("local")!.age;
      if (condition === "paused") game.active = false;
      if (condition === "hidden") Object.assign(document, { hidden: true });
      if (condition === "uncaptured") game.needsCapture = true;
      if (condition === "dead") game.health = 0;
      for (let i = 0; i < 180; i++) game.updateHorror(0.5);
      assert.equal(game.horrorDirector.states.get("local")!.age, age);
      assert.equal(events.length, 0);
      assert.equal(updates.at(-1).active, false);
      Object.assign(document, { hidden: false });
    }
  }));

test("Multiplayer uses only the server horror clock and disables presentation on disconnect", () =>
  browserFlags(() => {
    const { game, updates } = gameFixture();
    game.horrorDirector.tick = () => {
      throw new Error("A multiplayer client must not run a second director");
    };
    game.net = { connected: true, horrorClock: 123.4 } as any;
    game.updateHorror(0.05);
    assert.equal(updates.at(-1).time, 123.4);
    assert.equal(updates.at(-1).active, true);
    game.net!.connected = false;
    game.updateHorror(0.05);
    assert.equal(updates.at(-1).active, false);
  }));

test("Normal difficulty and wrong-dimension packets cannot show horror effects", () =>
  browserFlags(() => {
    const { game, events, updates } = gameFixture();
    const packet: HorrorEvent = {
      id: "x",
      kind: "jumpscare",
      p: [0, 20, -1],
      at: 0,
      duration: 1,
      intensity: 1,
      seed: 1,
      reason: "test",
      viewerIds: ["local"],
      dimension: "end",
      yaw: 0,
    };
    game.receiveHorror(packet);
    assert.equal(events.length, 0);
    game.difficulty = "normal";
    game.receiveHorror({ ...packet, dimension: "overworld" });
    game.updateHorror(0.05);
    assert.equal(events.length, 0);
    assert.equal(updates.at(-1).enabled, false);
    assert.equal(game.horrorDirector.elapsed, 0);
  }));

test("Restoring a legacy single-player save always resets a previous Horror choice to Normal", () => {
  const { game } = gameFixture();
  Object.assign(game, {
    clearDynamic() {},
    fluid: { clear() {} },
    dimensionChanged() {},
    ensure() {},
    pack: new InventoryPack(),
    selected: 0,
    drops: { restore() {} },
    adventure: { restore() {} },
    spawnMobs() {},
    velocity: new THREE.Vector3(),
    wakeWater() {},
  });
  Object.assign(game.world, { switch() {} });
  game.restore({
    v: 1,
    seed: 1,
    dimension: "overworld",
    position: [0, 20, 0],
    mode: "survival",
    health: 20,
    food: 20,
    xp: 0,
    clock: 90,
  });
  assert.equal(game.difficulty, "normal");
  assert.equal(game.horrorDirector.elapsed, 0);
  assert.deepEqual(game.pack.counts(), {});
});

test("Shader Off bypasses postprocessing and shadows; selecting a preset restores saved shadows", () => {
  const atmosphere = Object.create(Atmosphere.prototype) as Atmosphere;
  let direct = 0,
    composed = 0;
  Object.assign(atmosphere, {
    disposed: false,
    lastShader: "off",
    lastW: 100,
    lastH: 100,
    view: {
      scene: {},
      camera: {},
      renderer: { render: () => direct++, getSize: (v: THREE.Vector2) => v.set(100, 100) },
    },
    composer: { render: () => composed++ },
  });
  atmosphere.render();
  assert.equal(direct, 1);
  assert.equal(composed, 0);
  atmosphere.lastShader = "classic";
  atmosphere.render();
  assert.equal(direct, 1);
  assert.equal(composed, 1);
  const game = Object.create(Game.prototype) as Game;
  Object.assign(game, {
    settings: structuredClone(DEFAULT_SETTINGS),
    camera: new THREE.PerspectiveCamera(),
    renderer: { shadowMap: { enabled: true } },
    audio: {},
    atmosphere: { configure() {} },
    emit() {},
  });
  game.applySettings({ shader: "off", shadows: true });
  assert.equal(game.renderer.shadowMap.enabled, false);
  assert.equal(game.settings.shadows, true);
  game.applySettings({ shader: "classic" });
  assert.equal(game.renderer.shadowMap.enabled, true);
});
