import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../lib/world";
import { FluidSystem } from "../lib/fluid";
import { Game } from "../lib/engine";
import { Room } from "../server/room";
import { InventoryPack } from "../lib/inventory";

function setup() {
  const world = new World(24680);
  for (let x = -1; x <= 1; x++)
    for (let z = -1; z <= 1; z++) {
      const chunk = world.chunk(x, z);
      chunk.data.fill(0);
      chunk.data.fill(3, 40 * 256, 41 * 256);
    }
  const fluid = new FluidSystem(world);
  return { world, fluid };
}
function settle(fluid: FluidSystem) {
  for (let i = 0; i < 220 && fluid.queue.size; i++) fluid.step(10000);
  assert.equal(
    fluid.queue.size,
    0,
    "Water must settle instead of repeatedly recooling solid obsidian",
  );
}

test("Source lava forms obsidian regardless of whether water or lava is updated first", () => {
  for (const first of ["water", "lava"] as const)
    for (const [dx, dy, dz] of [
      [0, 1, 0],
      [1, 0, 0],
      [-1, 0, 0],
      [0, 0, 1],
      [0, 0, -1],
    ]) {
      const { world: w, fluid: f } = setup();
      w.set(8, 41, 8, 15);
      w.set(8 + dx, 41 + dy, 8 + dz, 7);
      f.clear();
      if (first === "water") f.update(8 + dx, 41 + dy, 8 + dz);
      else f.update(8, 41, 8);
      assert.equal(w.get(8, 41, 8), 12, `${first} at ${dx},${dy},${dz}`);
      assert.equal(w.get(8 + dx, 41 + dy, 8 + dz), 7, "The water source remains usable");
      assert.equal(w.edits["overworld:8,41,8"], 12);
    }
});
test("A real waterfall cools an exposed lava pool while leaving lava beneath its crust intact", () => {
  const { world: w, fluid: f } = setup();
  for (let x = 7; x <= 9; x++)
    for (let z = 7; z <= 9; z++) {
      w.set(x, 40, z, 15);
      w.set(x, 41, z, 15);
    }
  w.set(8, 45, 8, 7);
  settle(f);
  for (let x = 7; x <= 9; x++)
    for (let z = 7; z <= 9; z++) {
      assert.equal(w.get(x, 41, z), 12, `Surface at ${x},${z}`);
      assert.equal(w.get(x, 40, z), 15, "Water cannot cool hidden lava through the solid crust");
    }
  w.set(8, 45, 8, 0);
  settle(f);
  assert.equal(w.get(8, 41, 8), 12, "Removing the water does not remove the product");
  assert.equal(w.get(8, 44, 8), 0, "The unsupported waterfall still drains");
});
test("Every flowing water level also cools a lava source, without changing the stream into a source", () => {
  for (let level = 1; level <= 8; level++) {
    const { world: w, fluid: f } = setup();
    w.set(8, 41, 8, 15);
    const key = "overworld:9,41,8";
    w.waterLevels[key] = level;
    w.set(9, 41, 8, 7, true);
    f.update(8, 41, 8);
    assert.equal(w.get(8, 41, 8), 12);
    assert.equal(f.level(9, 41, 8), level);
  }
});
test("A solid barrier prevents cooling; opening it lets flowing water reach the lava", () => {
  const { world: w, fluid: f } = setup();
  w.set(8, 41, 8, 15);
  // Enclose the source so its water cannot detour around the separating block.
  w.set(8, 42, 8, 3);
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ])
    w.set(8 + dx, 43, 8 + dz, 3);
  w.set(8, 43, 8, 7);
  settle(f);
  assert.equal(w.get(8, 41, 8), 15);
  w.set(8, 42, 8, 0);
  settle(f);
  assert.equal(w.get(8, 41, 8), 12);
});
test("Water below or only diagonally next to lava does not cool it through a missing contact face", () => {
  const { world: w } = setup();
  w.set(8, 43, 8, 15);
  w.set(8, 42, 8, 7);
  w.set(9, 43, 9, 7);
  assert.equal(w.coolLava(8, 43, 8), false);
  assert.equal(w.get(8, 43, 8), 15);
});
test("Cooling across a chunk edge emits the authoritative edit and survives regeneration", () => {
  const { world: w, fluid: f } = setup();
  const edits: any[] = [];
  const onEdit = w.onEdit;
  w.onEdit = (x, y, z) => {
    onEdit?.(x, y, z);
    edits.push([x, y, z, w.get(x, y, z)]);
  };
  w.set(16, 41, 8, 15);
  w.set(15, 41, 8, 7);
  f.update(16, 41, 8);
  assert.equal(w.get(16, 41, 8), 12);
  assert(edits.some((edit) => edit.join(",") === "16,41,8,12"));
  const restored = new World(w.seed);
  restored.edits = { ...w.edits };
  restored.chunk(1, 0);
  assert.equal(restored.get(16, 41, 8), 12);
  assert.equal(w.chunks.get("1,0")!.dirty, true);
});
test("Pouring a bucket directly into a deep lava column creates surface water and obsidian immediately", () => {
  const { world: w } = setup();
  for (let y = 41; y <= 44; y++) w.set(8, y, 8, 15);
  assert.equal(w.pourWater(8, 41, 8), true);
  assert.equal(w.get(8, 44, 8), 12);
  assert.equal(w.get(8, 45, 8), 7);
  assert.equal(w.get(8, 43, 8), 15, "Only the exposed top source is cooled");
});
test("Actual single-player bucket use empties the bucket once on success and preserves it when blocked", () => {
  for (const blocked of [false, true]) {
    const { world: w } = setup();
    w.set(8, 41, 8, 15);
    if (blocked) w.set(8, 42, 8, 3);
    const game = Object.create(Game.prototype) as Game;
    Object.assign(game, {
      world: w,
      mode: "survival",
      actionCooldown: 0,
      hotbar: [115],
      selected: 0,
      target: { id: 3, x: 8, y: 40, z: 8, px: 8, py: 41, pz: 8 },
      inventory: { 115: 1 },
      audio: { play() {} },
      emit() {},
      add(id: number, n = 1) {
        game.inventory[id] = (game.inventory[id] ?? 0) + n;
      },
    });
    game.interact();
    assert.equal(game.inventory[115], blocked ? 1 : 0);
    assert.equal(game.inventory[114] ?? 0, blocked ? 0 : 1);
    assert.equal(w.get(8, 41, 8), blocked ? 15 : 12);
    assert.equal(game.hotbar[0], blocked ? 115 : 114);
  }
});
test("Actual server bucket commands use the same mixing, preserve blocked buckets and deduplicate costs", () => {
  for (const blocked of [false, true]) {
    const messages: any[] = [];
    const room = new Room(
      (_id, data) => messages.push(data),
      () => 1000000,
    );
    room.populate = () => {};
    room.join("a", "Alicja", undefined);
    const p = room.players.get("a")!;
    p.p = [8.5, 42, 10.5];
    p.held = 115;
    const pack = new InventoryPack();
    pack.slots[0] = { id: 115, n: 1 };
    p.profile.pack = pack.snapshot();
    p.profile.inventory = pack.counts();
    const w = room.ensure("overworld", 8, 8);
    w.set(8, 40, 8, 3);
    w.set(8, 41, 8, 15);
    w.set(8, 42, 8, blocked ? 3 : 0);
    const command = { type: "use", req: "bucket", x: 8, y: 40, z: 8, place: [8, 41, 8] };
    room.command("a", command);
    const response = messages.at(-1);
    assert.equal(response.ok, !blocked, response.message);
    assert.equal(w.get(8, 41, 8), blocked ? 15 : 12);
    const counts = p.profile.inventory as Record<number, number>;
    assert.equal(counts[115] ?? 0, blocked ? 1 : 0);
    assert.equal(counts[114] ?? 0, blocked ? 0 : 1);
    room.command("a", command);
    assert.deepEqual(messages.at(-1), response);
    assert.equal((p.profile.inventory as Record<number, number>)[114] ?? 0, blocked ? 0 : 1);
    if (!blocked) {
      assert.equal(w.get(8, 42, 8), 7);
      assert.equal(
        room.changes.get("overworld:8,41,8")?.[4],
        12,
        "Clients receive the actual obsidian edit",
      );
    }
  }
});
