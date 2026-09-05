import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Adventure } from "../lib/adventure";
import { createFurnace } from "../lib/furnace";
import type { Game } from "../lib/engine";

test("A local explosion removes furnace contents once before a replacement can inherit them", () => {
  const drops: [number, number][] = [];
  let block = 0, resumed = 0;
  const game = {
    position: new THREE.Vector3(0, 20, 0), world: { dimension: "overworld", get: () => block },
    drops: { spawn: (id: number, n: number) => drops.push([id, n]) },
    pauseReason: "furnace", resume: () => resumed++, emit: () => {},
  } as unknown as Game;
  const a = new Adventure(game), key = "overworld:0,20,0";
  a.currentFurnace = key;
  a.data.furnaces[key] = { ...createFurnace(), slots: [{ id: 21, n: 3 }, { id: 109, n: 2 }, { id: 110, n: 1 }] };
  a.furnaceBlockChanged(0, 20, 0);
  a.furnaceBlockChanged(0, 20, 0);
  assert.deepEqual(drops, [[21, 3], [109, 2], [110, 1]]);
  assert.equal(resumed, 1);
  assert.equal(a.data.furnaces[key], undefined);
  block = 29;
  a.data.furnaces[key] = createFurnace();
  assert.deepEqual(a.data.furnaces[key].slots, [null, null, null]);
});

test("Local furnace progresses while its panel is open and preserves progress in a save", () => {
  let emitted = 0;
  const game = {
    position: new THREE.Vector3(0, 20, 0), world: { dimension: "overworld", get: () => 29 },
    active: false, pauseReason: "furnace", emit: () => emitted++,
  } as unknown as Game;
  const a = new Adventure(game), key = "overworld:0,20,0";
  a.currentFurnace = key;
  a.data.furnaces[key] = { ...createFurnace(), slots: [{ id: 4, n: 2 }, { id: 109, n: 1 }, null] };
  a.tickFurnaces(5);
  assert.equal(a.furnaceState()?.progress, 5);
  const restored = new Adventure(game);
  restored.restore(structuredClone(a.data));
  restored.currentFurnace = key;
  restored.tickFurnaces(5);
  assert.deepEqual(restored.furnaceState()?.slots[2], { id: 10, n: 1 });
  assert.equal(restored.furnaceState()?.burnRemaining, 70);
  assert(emitted > 0);
});
