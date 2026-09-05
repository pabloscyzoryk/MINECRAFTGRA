import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { placeHorrorEvent } from "../lib/horror-placement";
import type { HorrorEvent } from "../lib/horror-director";
import { Game } from "../lib/engine";
import { DEFAULT_SETTINGS } from "../lib/settings";

const event = (): HorrorEvent => ({
  id: "place-guest",
  kind: "watcher",
  p: [10.5, 20, 0.5],
  yaw: 0,
  at: 120,
  duration: 9,
  intensity: 0.7,
  seed: 1,
  reason: "underground",
  viewerIds: ["local"],
  dimension: "overworld",
});
function world(block: (x: number, y: number, z: number) => number) {
  return {
    get: block,
    solid: (x: number, y: number, z: number) => block(x, y, z) === 1,
    surface: () => 20,
  };
}
const anchor: [number, number, number] = [0.5, 20, 0.5];

test("A wide four-block-clear cavern supports the complete Guest silhouette", () => {
  const cavern = world((_, y) => (y < 20 || y >= 25 ? 1 : 0));
  const cue = event();
  assert(placeHorrorEvent(cue, anchor, true, cavern));
  assert.equal(cue.kind, "watcher");
  assert.deepEqual(cue.p, [10.5, 20, 0.5]);
  assert.equal(cue.yaw, -Math.PI / 2);
});

test("A low ceiling, a narrow corridor, an absent floor and water all fall back to sound", () => {
  const spaces = [
    world((_, y) => (y < 20 || y >= 23 ? 1 : 0)),
    world((_, y, z) => (y < 20 || Math.abs(z - 0.5) > 0.6 ? 1 : 0)),
    world(() => 0),
    world((_, y) => (y < 20 ? 1 : 7)),
  ];
  for (const space of spaces) {
    const cue = event();
    assert.equal(placeHorrorEvent(cue, anchor, true, space), false);
    assert.equal(cue.kind, "knock");
    assert.equal(cue.reason, "obstructed");
    assert(cue.intensity <= 0.45);
  }
});

test("An intervening solid wall prevents spawning an unseen observer behind it", () => {
  const cue = event();
  const blocked = world((x, y) => (y < 20 || Math.floor(x) === 5 ? 1 : 0));
  assert.equal(placeHorrorEvent(cue, anchor, false, blocked), false);
  assert.equal(cue.kind, "knock");
});

test("Single-player integration uses footprint validation before forwarding a visible event", () => {
  const oldDocument = globalThis.document,
    oldWindow = globalThis.window;
  Object.assign(globalThis, {
    document: { hidden: false },
    window: { matchMedia: () => ({ matches: false }) },
  });
  try {
    const game = Object.create(Game.prototype) as Game;
    const received: HorrorEvent[] = [];
    Object.assign(game, {
      active: true,
      needsCapture: false,
      health: 20,
      net: null,
      difficulty: "horror",
      position: new THREE.Vector3(...anchor),
      yaw: 0,
      pitch: 0,
      clock: 0,
      settings: structuredClone(DEFAULT_SETTINGS),
      world: {
        ...world((_, y) => (y < 20 || y >= 23 ? 1 : 0)),
        dimension: "overworld",
        surface: () => 40,
      },
      horrorDirector: { elapsed: 120, tick: () => [event()] },
      horror: { event: (cue: HorrorEvent) => received.push(cue), update() {} },
    });
    game.updateHorror(0.05);
    assert.equal(received.length, 1);
    assert.equal(received[0].kind, "knock");
  } finally {
    Object.assign(globalThis, { document: oldDocument, window: oldWindow });
  }
});
