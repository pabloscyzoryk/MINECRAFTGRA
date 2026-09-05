import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../lib/world";
import { placeBed, bedPartner } from "../lib/bed";
import { CARDINAL, playerBox } from "../lib/block-shapes";

function platform() {
  const world = new World(44);
  for (let x = 13; x <= 18; x++)
    for (let z = 13; z <= 18; z++) {
      world.set(x, 49, z, 3);
      world.set(x, 50, z, 0);
      world.set(x, 51, z, 0);
    }
  return world;
}
test("A bed occupies two low cells in all four directions, including across a chunk boundary", () => {
  for (let facing = 0; facing < 4; facing++) {
    const w = platform(),
      [dx, , dz] = CARDINAL[facing];
    assert(placeBed(w, [15, 50, 15], (-facing * Math.PI) / 2));
    assert.equal(w.get(15, 50, 15), 190 + facing);
    assert.equal(w.get(15 + dx, 50, 15 + dz), 194 + facing);
    assert.equal(w.solid(15.5, 50.5, 15.5), true);
    assert.equal(w.solid(15.5, 50.6, 15.5), false);
    assert.equal(w.surface(15, 15), 50.5625);
  }
});
test("Failed placement leaves both cells unchanged for obstruction, unsupported head and another player", () => {
  for (const obstruction of ["block", "support", "player"]) {
    const w = platform();
    if (obstruction === "block") w.set(15, 50, 14, 3);
    if (obstruction === "support") w.set(15, 49, 14, 170);
    const edits = { ...w.edits };
    const occupied = obstruction === "player" ? [playerBox({ x: 15.5, y: 50, z: 14.5 })] : [];
    assert.equal(placeBed(w, [15, 50, 15], 0, occupied), false);
    assert.deepEqual(w.edits, edits);
  }
});
test("Mining either half removes only the matching partner; replayed edits cannot remove a neighbouring bed", () => {
  for (const head of [false, true]) {
    const w = platform();
    placeBed(w, [15, 50, 15], 0);
    w.set(15, 50, head ? 14 : 15, 0);
    assert.equal(w.get(15, 50, 15), 0);
    assert.equal(w.get(15, 50, 14), 0);
  }
  const w = platform();
  placeBed(w, [15, 50, 15], 0);
  w.set(15, 50, 14, 3);
  assert.equal(w.get(15, 50, 15), 0);
  assert.equal(w.get(15, 50, 14), 3);
  w.set(15, 50, 15, 0);
  assert.equal(w.get(15, 50, 14), 3);
  assert.equal(bedPartner(62, 15, 50, 15), null);
});
test("A two-cell bed and its removal persist through ordinary world edits", () => {
  const w = platform();
  placeBed(w, [15, 50, 15], -Math.PI / 2);
  const restored = new World(44);
  restored.edits = { ...w.edits };
  restored.chunk(0, 0);
  restored.chunk(1, 0);
  assert.equal(restored.get(16, 50, 15), 195);
  restored.set(15, 50, 15, 0);
  assert.equal(restored.get(16, 50, 15), 0);
});
