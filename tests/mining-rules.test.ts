import test from "node:test";
import assert from "node:assert/strict";
import { BLOCKS, ITEMS } from "../lib/blocks";
import {
  MINING_RULES,
  miningDuration,
  harvestAllowed,
  isMineableBlock,
  harvestHint,
} from "../lib/mining";
import { InventoryPack, maxStack } from "../lib/inventory";

test("Every block and existing tool has a finite, nonnegative mining rule or explicit protection", () => {
  for (const block of BLOCKS.filter(Boolean)) {
    assert(MINING_RULES[block.id], block.name);
    for (const held of [0, ...ITEMS.map((item) => item.id)]) {
      const seconds = miningDuration(block.id, held);
      assert(
        isMineableBlock(block.id) ? Number.isFinite(seconds) && seconds >= 0 : seconds === Infinity,
        `${block.name} / ${held}`,
      );
    }
  }
  assert.equal(isMineableBlock(35, 0), false);
  assert.equal(
    isMineableBlock(35, 5),
    true,
    "Basalt above the protected foundation is ordinary rock",
  );
});
test("Flowers, grass and crops break immediately even with an empty hand", () => {
  for (const block of [64, 65, 66, 67, 68, 69, 70, 72, 74, 79])
    for (const held of [0, ...ITEMS.map((item) => item.id)])
      assert.equal(miningDuration(block, held), 0);
  assert(miningDuration(5, 0) > 0, "Wood still requires sustained mining");
});
test("Pickaxe material tiers matter on ore and stone without giving a woodcutting bonus", () => {
  for (const block of [3, 9, 20, 21, 22, 80, 81, 82]) {
    const speeds = [0, 101, 102, 131, 103].map((held) => miningDuration(block, held));
    for (let i = 1; i < speeds.length; i++)
      assert(speeds[i] < speeds[i - 1], `${block}: ${speeds}`);
  }
  assert.equal(miningDuration(5, 103), miningDuration(5, 0));
  assert(miningDuration(5, 127) < miningDuration(5, 128));
});
test("Shovels dig all soils, while end stone, wool and flowers are not misclassified as ores", () => {
  for (const block of [1, 2, 4, 19, 42, 54, 55, 63]) {
    assert(miningDuration(block, 130) < miningDuration(block, 103));
    assert.equal(miningDuration(block, 103), miningDuration(block, 0));
  }
  assert(miningDuration(17, 101) < miningDuration(17, 130));
  for (const block of [31, 32, 45, 46]) {
    assert(miningDuration(block, 132) < miningDuration(block, 104));
    assert.equal(miningDuration(block, 103), miningDuration(block, 0));
  }
});
test("Hoes clear moss and foliage; shears recover leaf blocks; swords sever bamboo instantly", () => {
  for (const block of [6, 26, 50, 53, 77]) {
    assert(miningDuration(block, 118) < miningDuration(block, 0));
    assert(miningDuration(block, 132) < miningDuration(block, 118));
    assert.equal(harvestAllowed(block, 118), false);
    assert.equal(harvestAllowed(block, 132), true);
  }
  assert(miningDuration(71, 118) < miningDuration(71, 0));
  assert.equal(miningDuration(59, 104), 0);
  assert(miningDuration(59, 0) > 0);
});
test("The resource progression remains craftable: wood, stone, iron, diamond, obsidian", () => {
  for (const [block, tool, weaker] of [
    [20, 101, 0],
    [21, 102, 101],
    [22, 131, 102],
    [12, 103, 131],
  ]) {
    assert.equal(harvestAllowed(block, tool), true);
    assert.equal(harvestAllowed(block, weaker), false);
    assert(harvestHint(block, weaker));
    assert.equal(harvestHint(block, tool), null);
  }
  assert(miningDuration(12, 103) > 9);
  for (const block of [0, 7, 13, 15, 18]) assert.equal(harvestAllowed(block, 103), false);
  assert.equal(harvestAllowed(10, 103), false);
  assert.equal(harvestAllowed(60, 103), false);
});
test("Non-mining items cannot accidentally gain the speed or harvesting tier of a tool", () => {
  for (const held of [105, 106, 113, 114, 115, 123, 126, 129])
    for (const block of [3, 5, 21, 55, 82]) {
      assert.equal(miningDuration(block, held), miningDuration(block, 0));
      assert.equal(harvestAllowed(block, held), harvestAllowed(block, 0));
    }
});
test("Iron pickaxes and shears have shaped recipes and occupy single equipment slots", () => {
  const pick = new InventoryPack();
  pick.size = 3;
  pick.grid = [110, 110, 110, 0, 112, 0, 0, 112, 0].map((id) => (id ? { id, n: 1 } : null));
  assert.equal(pick.recipe()?.out, 131);
  const scissors = new InventoryPack();
  scissors.size = 2;
  scissors.grid = [0, 110, 110, 0].map((id) => (id ? { id, n: 1 } : null));
  assert.equal(scissors.recipe()?.out, 132);
  assert.equal(maxStack(131), 1);
  assert.equal(maxStack(132), 1);
});
