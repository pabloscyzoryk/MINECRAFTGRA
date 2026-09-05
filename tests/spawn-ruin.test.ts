import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../lib/world";
import { ignitePortal } from "../lib/portals";

function load(world: World) {
  const r = world.ruinLocation();
  for (let x = Math.floor((r.x - 3) / 16); x <= Math.floor((r.x + 6) / 16); x++)
    for (let z = Math.floor((r.z - 3) / 16); z <= Math.floor((r.z + 4) / 16); z++)
      world.chunk(x, z);
  return r;
}
test("Every seed puts the ruined Nether frame beside spawn, with three real gaps and an empty interior", () => {
  for (const seed of [24680, 42, 999, -34]) {
    const world = new World(seed),
      r = load(world);
    assert.deepEqual([r.x, r.z], [-18, 12]);
    assert(Math.hypot(r.x - 8.5, r.z - 22.5) < 32);
    assert.equal(world.get(r.x - 1, r.y, r.z + 2), 61);
    let obsidian = 0,
      gaps = 0;
    for (let x = 0; x < 4; x++)
      for (let y = 0; y < 5; y++) {
        const id = world.get(r.x + x, r.y + y, r.z);
        if (x === 0 || x === 3 || y === 0 || y === 4) {
          if (id === 12) obsidian++;
          else {
            assert.equal(id, 0);
            gaps++;
          }
        } else assert.equal(id, 0);
      }
    assert.equal(obsidian, 11);
    assert.equal(gaps, 3);
    assert.equal(ignitePortal(world, r.x, r.y, r.z), false);
  }
});
test("All three gaps must be repaired and then ignited; the nearby End gateway stays intact", () => {
  const world = new World(),
    r = load(world);
  for (const [index, [x, y]] of [
    [0, 2],
    [3, 3],
    [1, 4],
  ].entries()) {
    world.set(r.x + x, r.y + y, r.z, 12);
    if (index < 2) assert.equal(ignitePortal(world, r.x, r.y, r.z), false);
  }
  assert.equal(world.get(r.x + 1, r.y + 1, r.z), 0, "Repair alone does not activate the frame");
  assert.equal(ignitePortal(world, r.x, r.y, r.z), true);
  assert.equal(world.get(r.x + 1, r.y + 1, r.z), 13);
  world.chunk(1, -1);
  assert.equal(world.get(20, world.height(20, -15) + 2, -15), 18);
});
test("An existing saved world gets the nearby ruin on regeneration and preserves the player's edits", () => {
  const world = new World(24680),
    r = world.ruinLocation();
  world.edits[`overworld:${r.x},${r.y},${r.z}`] = 0;
  world.edits[`overworld:${r.x + 1},${r.y + 1},${r.z}`] = 10;
  load(world);
  assert.equal(world.get(r.x, r.y, r.z), 0);
  assert.equal(world.get(r.x + 1, r.y + 1, r.z), 10);
  assert.equal(world.get(r.x + 3, r.y, r.z), 12);
});
