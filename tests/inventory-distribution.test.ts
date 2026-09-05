import test from "node:test";
import assert from "node:assert/strict";
import { InventoryPack, GRID_RECIPES, maxStack, type Stack } from "../lib/inventory";
import { blankChest, type ChestSlots } from "../lib/chest-slots";
import { createFurnace } from "../lib/furnace";
import {
  applyInventoryGesture,
  applyCraftResult,
  planDistribution,
  validGesture,
  type SlotRef,
} from "../lib/inventory-gestures";

const slots = (...indices: number[]): SlotRef[] =>
  indices.map((index) => ({ area: "slots", index }));
const total = (pack: InventoryPack, ...containers: ChestSlots[]) => {
  const counts = pack.counts();
  for (const container of containers)
    for (const stack of container) if (stack) counts[stack.id] = (counts[stack.id] ?? 0) + stack.n;
  return counts;
};

test("LMB distributes equally with remainder and the preview is exactly the committed result", () => {
  const pack = new InventoryPack();
  pack.cursor = { id: 8, n: 17 };
  const before = total(pack),
    refs = slots(0, 1, 2, 1);
  const plan = planDistribution(pack.cursor, refs, (ref) => pack.slots[ref.index]);
  assert.deepEqual(
    plan.slots.map((change) => change.added),
    [5, 5, 5],
  );
  assert.deepEqual(plan.cursor, { id: 8, n: 2 });
  assert.equal(pack.slots[0], null, "preview does not mutate inventory");
  assert(applyInventoryGesture(pack, { type: "distribute", slots: refs }));
  for (const change of plan.slots) assert.deepEqual(pack.slots[change.slot.index], change.stack);
  assert.deepEqual(pack.cursor, plan.cursor);
  assert.deepEqual(total(pack), before);
});

test("RMB places one per unique visited slot, skips incompatible/full stacks and stops at held count", () => {
  const pack = new InventoryPack();
  pack.cursor = { id: 8, n: 3 };
  pack.slots[1] = { id: 9, n: 1 };
  pack.slots[2] = { id: 8, n: 64 };
  const before = total(pack);
  assert(
    applyInventoryGesture(pack, {
      type: "distribute",
      right: true,
      slots: slots(0, 0, 1, 2, 3, 4, 5),
    }),
  );
  for (const i of [0, 3, 4]) assert.deepEqual(pack.slots[i], { id: 8, n: 1 });
  assert.equal(pack.slots[5], null);
  assert.equal(pack.cursor, null);
  assert.deepEqual(total(pack), before);
});

test("LMB caps each selected stack without reallocating its unused share to other slots", () => {
  const pack = new InventoryPack(),
    chest = blankChest();
  pack.cursor = { id: 8, n: 10 };
  chest[0] = { id: 8, n: 63 };
  const before = total(pack, chest);
  assert(
    applyInventoryGesture(
      pack,
      {
        type: "distribute",
        slots: [
          { area: "chest", index: 0 },
          { area: "grid", index: 0 },
        ],
      },
      chest,
    ),
  );
  assert.deepEqual(chest[0], { id: 8, n: 64 });
  assert.deepEqual(pack.grid[0], { id: 8, n: 5 });
  assert.deepEqual(pack.cursor, { id: 8, n: 4 });
  assert.deepEqual(total(pack, chest), before);
});

test("Unstackable tools, buckets and low held counts respect their actual stack limits", () => {
  for (const [id, n] of [
    [108, 1],
    [114, 13],
    [8, 2],
  ]) {
    const pack = new InventoryPack();
    pack.cursor = { id, n };
    assert(applyInventoryGesture(pack, { type: "distribute", slots: slots(0, 1, 2) }));
    for (const stack of pack.slots) if (stack) assert(stack.n > 0 && stack.n <= maxStack(id));
    assert.equal(total(pack)[id], n);
    if (id === 108) assert.deepEqual(pack.slots[0], { id, n: 1 });
    if (id === 8) assert.equal(pack.slots[2], null);
  }
});

test("Invalid, unavailable and hidden destinations reject a whole distribution without losing items", () => {
  const pack = new InventoryPack();
  pack.cursor = { id: 8, n: 17 };
  const before = pack.snapshot();
  for (const ref of [
    { area: "slots", index: 36 },
    { area: "grid", index: 4 },
    { area: "chest", index: 0 },
    { area: "furnace", index: 0 },
    { area: "result", index: 0 },
  ] as SlotRef[]) {
    assert.equal(
      applyInventoryGesture(pack, { type: "distribute", slots: [...slots(0), ref] }),
      false,
    );
    assert.deepEqual(pack.snapshot(), before);
  }
  assert(!validGesture({ type: "distribute", slots: [] }));
  assert(!validGesture({ type: "distribute", slots: slots(...Array(76).fill(0)) }));
  assert(!validGesture({ type: "distribute", slots: slots(0), right: "yes" }));
});

test("Furnace distribution accepts manual input and fuel, but output remains read-only", () => {
  const pack = new InventoryPack(),
    furnace = createFurnace();
  pack.cursor = { id: 109, n: 7 };
  const before = total(pack, furnace.slots);
  const refs: SlotRef[] = [0, 1, 2].map((index) => ({ area: "furnace", index }));
  assert(
    applyInventoryGesture(pack, { type: "distribute", slots: refs }, undefined, furnace.slots),
  );
  assert.deepEqual(furnace.slots, [{ id: 109, n: 3 }, { id: 109, n: 3 }, null]);
  assert.deepEqual(pack.cursor, { id: 109, n: 1 });
  assert.deepEqual(total(pack, furnace.slots), before);
  furnace.slots = [null, null, null];
  pack.cursor = { id: 108, n: 1 };
  assert(
    applyInventoryGesture(pack, { type: "distribute", slots: refs }, undefined, furnace.slots),
  );
  assert.deepEqual(furnace.slots, [{ id: 108, n: 1 }, null, null]);
});

test("Furnace output permits pickup/collection, rejects deposit and cannot be used as swap storage", () => {
  const pack = new InventoryPack(),
    furnace = createFurnace();
  furnace.slots[2] = { id: 110, n: 8 };
  pack.slots[0] = { id: 9, n: 2 };
  const before = total(pack, furnace.slots);
  assert.equal(
    applyInventoryGesture(
      pack,
      { type: "move", from: { area: "furnace", index: 2 }, to: { area: "slots", index: 0 } },
      undefined,
      furnace.slots,
    ),
    false,
  );
  assert.equal(
    applyInventoryGesture(
      pack,
      { type: "move", from: { area: "slots", index: 0 }, to: { area: "furnace", index: 2 } },
      undefined,
      furnace.slots,
    ),
    false,
  );
  assert.deepEqual(total(pack, furnace.slots), before);
  assert(
    applyInventoryGesture(
      pack,
      { type: "click", slot: { area: "furnace", index: 2 }, right: true },
      undefined,
      furnace.slots,
    ),
  );
  assert.deepEqual(pack.cursor, { id: 110, n: 4 });
  assert(applyInventoryGesture(pack, { type: "collect", id: 110 }, undefined, furnace.slots));
  assert.deepEqual(pack.cursor, { id: 110, n: 8 });
  assert.equal(furnace.slots[2], null);
  assert.equal(
    applyInventoryGesture(
      pack,
      { type: "click", slot: { area: "furnace", index: 2 } },
      undefined,
      furnace.slots,
    ),
    false,
  );
  assert.deepEqual(total(pack, furnace.slots), before);
});

test("Furnace shift transfers route ore to input, fuel to fuel and other items between main/hotbar", () => {
  const pack = new InventoryPack(),
    furnace = createFurnace();
  pack.slots[0] = { id: 21, n: 10 };
  pack.slots[1] = { id: 109, n: 8 };
  pack.slots[2] = { id: 111, n: 4 };
  const before = total(pack, furnace.slots);
  for (const index of [0, 1, 2])
    assert(
      applyInventoryGesture(
        pack,
        { type: "click", slot: { area: "slots", index }, quick: true },
        undefined,
        furnace.slots,
      ),
    );
  assert.deepEqual(furnace.slots[0], { id: 21, n: 10 });
  assert.deepEqual(furnace.slots[1], { id: 109, n: 8 });
  assert.deepEqual(pack.slots[9], { id: 111, n: 4 });
  assert(
    applyInventoryGesture(
      pack,
      { type: "click", slot: { area: "furnace", index: 0 }, quick: true },
      undefined,
      furnace.slots,
    ),
  );
  assert.equal(furnace.slots[0], null);
  assert.deepEqual(pack.slots[0], { id: 21, n: 10 });
  assert.deepEqual(total(pack, furnace.slots), before);
});

test("A stale shared furnace drag cannot pick up the replacement stack", () => {
  const pack = new InventoryPack(),
    furnace = createFurnace();
  furnace.slots[0] = { id: 4, n: 8 };
  const before = total(pack, furnace.slots);
  assert.equal(
    applyInventoryGesture(
      pack,
      {
        type: "move",
        from: { area: "furnace", index: 0 },
        to: { area: "slots", index: 0 },
        expected: { id: 21, n: 8 },
      },
      undefined,
      furnace.slots,
    ),
    false,
  );
  assert.deepEqual(total(pack, furnace.slots), before);
  assert.equal(pack.slots[0], null);
});

test("Shift-clicking a crafting ingredient returns it to storage even while another stack is held", () => {
  const pack = new InventoryPack();
  pack.grid[0] = { id: 5, n: 17 };
  pack.cursor = { id: 9, n: 4 };
  const before = pack.counts();
  assert(
    applyInventoryGesture(pack, { type: "click", slot: { area: "grid", index: 0 }, quick: true }),
  );
  assert.equal(pack.grid[0], null);
  assert.deepEqual(pack.cursor, { id: 9, n: 4 });
  assert.deepEqual(pack.slots[0], { id: 5, n: 17 });
  assert.deepEqual(pack.counts(), before);
});

test("Output drag crafts atomically into its target; rejection consumes no ingredients", () => {
  const pack = new InventoryPack();
  pack.grid[0] = { id: 5, n: 2 };
  for (const [to, expected] of [
    [
      { area: "slots", index: 1 },
      { id: 8, n: 4 },
    ],
    [
      { area: "result", index: 0 },
      { id: 8, n: 4 },
    ],
    [
      { area: "slots", index: 2 },
      { id: 44, n: 4 },
    ],
  ] as [SlotRef, Stack][]) {
    pack.slots[1] = { id: 8, n: 62 };
    const before = pack.snapshot();
    assert.equal(applyCraftResult(pack, { to, expected }), false);
    assert.deepEqual(pack.snapshot(), before);
  }
  assert(applyCraftResult(pack, { to: { area: "slots", index: 2 }, expected: { id: 8, n: 4 } }));
  assert.deepEqual(pack.slots[2], { id: 8, n: 4 });
  assert.deepEqual(pack.grid[0], { id: 5, n: 1 });
  assert.equal(pack.cursor, null);
});

test("Shift crafting fills at most one output stack and never consumes ingredients beyond capacity", () => {
  const pack = new InventoryPack();
  pack.grid[0] = { id: 5, n: 40 };
  assert(applyCraftResult(pack, { quick: true, expected: undefined, to: undefined }));
  assert.deepEqual(pack.slots[0], { id: 8, n: 64 });
  assert.deepEqual(pack.grid[0], { id: 5, n: 24 });
  pack.slots = Array.from({ length: 36 }, () => ({ id: 8, n: 64 }));
  pack.slots[0]!.n = 59;
  assert(applyCraftResult(pack, { quick: true }));
  assert.deepEqual(pack.slots[0], { id: 8, n: 63 });
  assert.deepEqual(pack.grid[0], { id: 5, n: 23 });
  const before = pack.snapshot();
  assert.equal(applyCraftResult(pack, { quick: true }), false);
  assert.deepEqual(pack.snapshot(), before);
});

test("Furnace recipes cannot be filled or crafted through a nearby crafting table", () => {
  for (const id of [21, 80, 4]) {
    const pack = new InventoryPack();
    pack.grid[0] = { id, n: 3 };
    pack.grid[1] = { id: 109, n: 3 };
    const before = pack.snapshot();
    assert.equal(pack.recipe(true), null);
    assert.equal(pack.takeResult(true, true), false);
    assert.equal(applyCraftResult(pack), false);
    assert.deepEqual(pack.snapshot(), before);
  }
  const pack = new InventoryPack();
  for (let i = 0; i < GRID_RECIPES.length; i++)
    if (GRID_RECIPES[i].furnace) assert.equal(pack.fillRecipe(i, true), false);
});

test("Distribution conserves every item under mixed capacities and both mouse buttons", () => {
  for (let seed = 1; seed <= 150; seed++) {
    const pack = new InventoryPack(),
      chest = blankChest();
    const id = [8, 114, 108][seed % 3],
      cap = maxStack(id);
    pack.cursor = { id, n: 1 + ((seed * 13) % cap) };
    for (let i = 0; i < 10; i++)
      chest[i] =
        (i + seed) % 4 === 0
          ? null
          : { id: (i + seed) % 3 === 0 ? 9 : id, n: 1 + ((seed * 17 + i * 11) % cap) };
    const before = total(pack, chest);
    const refs: SlotRef[] = Array.from({ length: 20 }, (_, i) => ({
      area: i % 2 ? "chest" : "slots",
      index: i % 10,
    }));
    assert(
      applyInventoryGesture(
        pack,
        { type: "distribute", slots: refs, right: seed % 2 === 0 },
        chest,
      ),
    );
    assert.deepEqual(total(pack, chest), before);
    for (const stack of [...pack.slots, ...chest, pack.cursor])
      if (stack) assert(stack.n >= 1 && stack.n <= maxStack(stack.id));
  }
});
