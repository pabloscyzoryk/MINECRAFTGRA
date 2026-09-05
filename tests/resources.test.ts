import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../lib/world";
import { BLOCKS, ITEMS } from "../lib/blocks";
import { GRID_RECIPES, InventoryPack, maxStack } from "../lib/inventory";
import { createFurnace, tickFurnace } from "../lib/furnace";
import { harvestAllowed, minedResource, miningDuration } from "../lib/mining";
import { armorPoints } from "../lib/armor";

test("New ores generate reproducibly in their intended dimension without replacing player edits", () => {
  const counts = (dimension: "overworld" | "nether") => {
    const world = new World(24680);
    world.dimension = dimension;
    const counts = new Map<number, number>();
    for (let x = -2; x <= 2; x++)
      for (let z = -2; z <= 2; z++)
        for (const id of world.chunk(x, z).data)
          if (id >= 87 && id <= 93) counts.set(id, (counts.get(id) ?? 0) + 1);
    return { counts, world };
  };
  const overworld = counts("overworld"),
    nether = counts("nether");
  for (const ore of [87, 88, 89, 90]) assert((overworld.counts.get(ore) ?? 0) > 0, `Ore ${ore}`);
  for (const ore of [91, 92, 93]) assert((nether.counts.get(ore) ?? 0) > 0, `Nether ore ${ore}`);
  assert.equal(overworld.counts.has(92), false);
  assert.equal(nether.counts.has(90), false);
  const copy = new World(24680);
  assert.deepEqual(copy.chunk(0, 0).data, overworld.world.chunk(0, 0).data);
  overworld.world.set(5, 5, 5, 94);
  overworld.world.chunks.clear();
  overworld.world.chunk(0, 0);
  assert.equal(
    overworld.world.get(5, 5, 5),
    94,
    "Saved constructions survive terrain regeneration",
  );
});
test("Gold and ancient debris can be smelted and minerals have distinct products", () => {
  for (const [ore, result] of [
    [87, 133],
    [92, 138],
  ]) {
    const furnace = createFurnace();
    furnace.slots = [{ id: ore, n: 1 }, { id: 109, n: 1 }, null];
    tickFurnace(furnace, 11);
    assert.deepEqual(furnace.slots[2], { id: result, n: 1 });
  }
  for (const [ore, item, n] of [
    [88, 134, 4],
    [89, 135, 5],
    [90, 136, 1],
    [91, 137, 1],
    [93, 133, 1],
  ])
    assert.deepEqual(minedResource(ore), { id: item, n });
  assert.deepEqual(minedResource(87), { id: 87, n: 1 });
});
test("Every new armor part and tool has a usable recipe and cannot stack", () => {
  for (const id of [121, 122, ...Array.from({ length: 22 }, (_, i) => 141 + i)]) {
    assert.equal(maxStack(id), 1);
    assert(ITEMS.some((item) => item.id === id));
    const recipe = GRID_RECIPES.find((recipe) => recipe.out === id)!;
    assert(recipe, `Recipe ${id}`);
    const pack = new InventoryPack();
    pack.size = 3;
    pack.grid = Array(9).fill(null);
    recipe.pattern.forEach((row, y) =>
      row.forEach((id, x) => {
        pack.grid[y * 3 + x] = id ? { id: id === -1 ? 8 : id, n: 1 } : null;
      }),
    );
    assert.equal(pack.recipe()?.out, id);
  }
});
test("Resource storage blocks unpack exactly their crafting cost", () => {
  for (const [item, block] of [
    [133, 33],
    [110, 94],
    [109, 95],
    [134, 96],
    [135, 97],
    [111, 34],
    [136, 37],
    [139, 99],
  ]) {
    assert(BLOCKS[block]);
    const forward = GRID_RECIPES.find((recipe) => recipe.out === block)!;
    const backward = GRID_RECIPES.find(
      (recipe) => recipe.out === item && recipe.pattern[0][0] === block,
    )!;
    assert.equal(forward.pattern.flat().filter((id) => id === item).length, 9);
    assert.equal(backward.n, 9);
  }
});
test("Armor improves from leather to gold to iron to diamond while gold tools trade harvest tier for speed", () => {
  const sets = [
    [141, 142, 143, 144],
    [145, 146, 147, 148],
    [149, 121, 150, 151],
    [152, 122, 153, 154],
  ];
  assert.deepEqual(
    sets.map(([head, chest, legs, feet]) => armorPoints({ head, chest, legs, feet })),
    [7, 11, 15, 20],
  );
  assert(miningDuration(3, 155) < miningDuration(3, 103));
  assert.equal(harvestAllowed(22, 155), false);
  assert.equal(harvestAllowed(22, 131), true);
  assert.equal(harvestAllowed(92, 131), false);
  assert.equal(harvestAllowed(92, 103), true);
});
