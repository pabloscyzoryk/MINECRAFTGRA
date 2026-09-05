import test from "node:test";
import assert from "node:assert/strict";
import { createHuntEnvironment } from "../lib/horror-terrain";

function fixture(wall = false, step = false) {
  const get = (x: number, y: number, _z: number) =>
    y < 1 || (wall && x >= 2 && x < 3 && y < 6) || (step && x >= 2 && y < 2) ? 1 : 0;
  return createHuntEnvironment(() => ({
    get,
    solid: (x, y, z) => !!get(x, y, z),
    surface: () => 1,
  }));
}
test("A Guest lunge sweeps solid walls rather than tunnelling through them", () => {
  const env = fixture(true);
  const p = env.move([0, 1, 0], [6, 1, 0], "overworld")!;
  assert(p[0] < 1.6);
  assert.equal(env.lineClear([0, 2, 0], [6, 2, 0], "overworld"), false);
});
test("The Guest can cross open ground and climb one-block terrain steps", () => {
  assert.deepEqual(fixture().move([0, 1, 0], [6, 1, 0], "overworld"), [6, 1, 0]);
  assert.deepEqual(fixture(false, true).move([0, 1, 0], [6, 1, 0], "overworld"), [6, 2, 0]);
});
test("A narrow shelter is a real obstacle to the tall Guest", () => {
  const get = (x: number, y: number) => (y < 1 || (x >= 2 && y >= 3 && y < 4) ? 1 : 0);
  const env = createHuntEnvironment(() => ({
    get,
    solid: (x, y) => !!get(x, y),
    surface: () => 1,
  }));
  assert(env.move([0, 1, 0], [5, 1, 0], "overworld")![0] < 1.6);
});
