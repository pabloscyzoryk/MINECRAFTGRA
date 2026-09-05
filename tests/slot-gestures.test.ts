import test from "node:test";
import assert from "node:assert/strict";
import {
  HeldCursorDrag,
  InventoryClickSequence,
  pointerPath,
  sameSlot,
  slotCursorPosition,
  slotMovement,
  slotReleaseKind,
} from "../hooks/slot-gesture-state";
import { InventoryPack, maxStack, type Stack } from "../lib/inventory";
import { blankChest } from "../lib/chest-slots";
import { applyInventoryGesture, type SlotRef } from "../lib/inventory-gestures";
import { createFurnace } from "../lib/furnace";

const activation = {
  slot: { area: "chest" as const, index: 4 },
  slotId: 8,
  time: 100,
  x: 130,
  y: 240,
  pointerType: "mouse",
};

test("Double click collects before a second click can put the held stack back", () => {
  const clicks = new InventoryClickSequence();
  assert.equal(clicks.activate(activation).type, "click");
  assert.deepEqual(clicks.activate({ ...activation, time: 240, slotId: undefined, cursorId: 8 }), {
    type: "collect",
    id: 8,
  });
});

test("Double click remembers the item while multiplayer replies are still queued", () => {
  const clicks = new InventoryClickSequence();
  assert.equal(clicks.activate(activation).type, "click");
  assert.deepEqual(clicks.activate({ ...activation, time: 250 }), { type: "collect", id: 8 });
  // Even a cleared slot snapshot during a reply does not lose the first item identity.
  clicks.activate({ ...activation, time: 600 });
  assert.deepEqual(clicks.activate({ ...activation, time: 810, slotId: undefined }), {
    type: "collect",
    id: 8,
  });
});

test("Click-click transfer to another slot never becomes collect", () => {
  const clicks = new InventoryClickSequence();
  clicks.activate(activation);
  const to = { area: "slots" as const, index: 4 };
  assert.deepEqual(clicks.activate({ ...activation, time: 180, slot: to, cursorId: 8 }), {
    type: "click",
    slot: to,
    quick: undefined,
  });
  assert(!sameSlot(activation.slot, to));
});

test("Slow clicks, changed item, shift transfers and keyboard actions do not collect", () => {
  for (const changed of [
    { time: 500 },
    { slotId: 9, time: 160 },
    { quick: true, time: 160 },
    { pointerType: "keyboard", time: 160 },
    { x: 145, time: 160 },
  ]) {
    const clicks = new InventoryClickSequence();
    clicks.activate(activation);
    assert.equal(clicks.activate({ ...activation, ...changed }).type, "click");
  }
});

test("Reset after drag, right click or cancellation prevents accidental collection", () => {
  const clicks = new InventoryClickSequence();
  clicks.activate(activation);
  clicks.reset();
  assert.equal(clicks.activate({ ...activation, time: 180 }).type, "click");
});

test("Mouse movement tolerates jitter; touch distinguishes panel swipe and deliberate drag", () => {
  assert.equal(slotMovement("mouse", 2, 1, 50), "pending");
  assert.equal(slotMovement("mouse", 20, 0, 50), "drag");
  assert.equal(slotMovement("touch", 3, 7, 60), "pending");
  assert.equal(slotMovement("touch", 3, 30, 60), "scroll");
  assert.equal(slotMovement("touch", 3, 30, 210), "drag");
  assert.equal(slotMovement("touch", 30, 3, 60), "drag");
});

test("Only completed drags onto a different slot emit a move; outside releases preserve the stack", () => {
  const from = { area: "chest" as const, index: 2 };
  const to = { area: "slots" as const, index: 29 };
  assert.equal(slotReleaseKind("drag", from, to), "move");
  assert.equal(slotReleaseKind("drag", from, null), "cancel");
  assert.equal(slotReleaseKind("drag", from, from), "cancel");
  assert.equal(slotReleaseKind("pending", from, from), "click");
  assert.equal(slotReleaseKind("pending", from, to), "cancel");
  assert.equal(slotReleaseKind("scroll", from, to), "cancel");
  assert.equal(slotReleaseKind("drag", from, { area: "result", index: 0 }), "cancel");
  assert.equal(slotReleaseKind("drag", { area: "result", index: 0 }, to), "move");
});

const cell = (index: number, area: SlotRef["area"] = "slots"): SlotRef => ({ area, index });
function dragFixture(cursor: Stack) {
  const pack = new InventoryPack(),
    chest = blankChest(),
    furnace = createFurnace().slots;
  pack.cursor = { ...cursor };
  const getStack = (ref: SlotRef) =>
    ref.area === "slots"
      ? pack.slots[ref.index]
      : ref.area === "grid"
        ? pack.grid[ref.index]
        : ref.area === "chest"
          ? chest[ref.index]
          : ref.area === "furnace"
            ? furnace[ref.index]
            : null;
  const total = () =>
    [...pack.slots, ...pack.grid, ...chest, ...furnace, pack.cursor].reduce(
      (sum, stack) => sum + (stack?.n ?? 0),
      0,
    );
  return { pack, chest, furnace, getStack, total };
}

test("Held LMB drag previews an even split across inventory, crafting and chest without editing them", () => {
  const f = dragFixture({ id: 8, n: 11 }),
    drag = new HeldCursorDrag(f.pack.cursor!);
  const refs = [cell(0), cell(1, "grid"), cell(2, "chest")];
  f.chest[2] = { id: 8, n: 10 };
  const before = f.total(),
    originals = structuredClone([f.pack.snapshot(), f.chest]);
  for (const ref of refs) assert(drag.visit(ref, f.getStack));
  const preview = drag.preview(f.getStack);
  assert.deepEqual(
    preview.slots.map((s) => [s.slot, s.stack.n, s.added]),
    [
      [refs[0], 3, 3],
      [refs[1], 3, 3],
      [refs[2], 13, 3],
    ],
  );
  assert.deepEqual(preview.cursor, { id: 8, n: 2 });
  assert.deepEqual([f.pack.snapshot(), f.chest], originals);
  const action = drag.finish(true, f.getStack);
  assert(action);
  assert(applyInventoryGesture(f.pack, action, f.chest, f.furnace));
  for (const change of preview.slots) assert.deepEqual(f.getStack(change.slot), change.stack);
  assert.deepEqual(f.pack.cursor, preview.cursor);
  assert.equal(f.total(), before);
  assert.equal(drag.finish(true, f.getStack), null, "a duplicate pointerup cannot commit twice");
});

test("Held RMB drag deposits exactly one per distinct compatible slot and stops when exhausted", () => {
  const f = dragFixture({ id: 8, n: 3 }),
    drag = new HeldCursorDrag(f.pack.cursor!, true);
  f.pack.slots[0] = { id: 8, n: 63 };
  f.pack.slots[1] = { id: 9, n: 2 };
  f.pack.slots[2] = { id: 8, n: 64 };
  const before = f.total();
  assert(drag.visit(cell(0), f.getStack));
  assert(!drag.visit(cell(0), f.getStack));
  assert(!drag.visit(cell(1), f.getStack));
  assert(!drag.visit(cell(2), f.getStack));
  assert(drag.visit(cell(3), f.getStack));
  assert(drag.visit(cell(4), f.getStack));
  assert(!drag.visit(cell(5), f.getStack));
  const preview = drag.preview(f.getStack);
  assert.deepEqual(
    preview.slots.map((s) => s.added),
    [1, 1, 1],
  );
  assert.equal(preview.cursor, null);
  assert(applyInventoryGesture(f.pack, drag.finish(true, f.getStack)!, f.chest));
  assert.equal(f.pack.slots[0]!.n, 64);
  assert.equal(f.pack.slots[1]!.id, 9);
  assert.equal(f.pack.slots[5], null);
  assert.equal(f.total(), before);
});

test("Preview respects 64, 16 and 1 item limits and keeps capped excess on the cursor", () => {
  for (const id of [8, 114, 101]) {
    const cap = maxStack(id),
      f = dragFixture({ id, n: cap });
    f.pack.slots[0] = cap > 1 ? { id, n: cap - 1 } : null;
    const drag = new HeldCursorDrag(f.pack.cursor!);
    drag.visit(cell(0), f.getStack);
    drag.visit(cell(1), f.getStack);
    const preview = drag.preview(f.getStack),
      before = f.total();
    assert(preview.slots.every((entry) => entry.stack.n <= cap));
    assert.equal(
      preview.slots.reduce((sum, entry) => sum + entry.added, preview.cursor?.n ?? 0),
      cap,
    );
    if (cap > 1) assert.equal(preview.cursor?.n, cap - 1 - Math.floor(cap / 2));
    else assert.equal(preview.slots.length, 1);
    assert(applyInventoryGesture(f.pack, drag.finish(true, f.getStack)!));
    assert.equal(f.total(), before);
  }
});

test("Furnace output and craft result cannot receive distributed items; fuel restriction matches commit", () => {
  for (const id of [109, 21]) {
    const f = dragFixture({ id, n: 6 }),
      drag = new HeldCursorDrag(f.pack.cursor!);
    assert(drag.visit(cell(0, "furnace"), f.getStack));
    assert.equal(drag.visit(cell(1, "furnace"), f.getStack), id === 109);
    assert(!drag.visit(cell(2, "furnace"), f.getStack));
    assert(!drag.visit(cell(0, "result"), f.getStack));
    assert(drag.visit(cell(0), f.getStack));
    const plan = drag.preview(f.getStack),
      before = f.total();
    assert.deepEqual(
      plan.slots.map((s) => s.added),
      id === 109 ? [2, 2, 2] : [3, 3],
    );
    assert(applyInventoryGesture(f.pack, drag.finish(true, f.getStack)!, undefined, f.furnace));
    for (const change of plan.slots) assert.deepEqual(f.getStack(change.slot), change.stack);
    assert.equal(f.furnace[2], null);
    assert.equal(f.total(), before);
  }
});

test("Cancelled, outside and empty gestures never consume or move anything", () => {
  for (const cancel of ["explicit", "outside", "empty"] as const) {
    const f = dragFixture({ id: 8, n: 23 }),
      drag = new HeldCursorDrag(f.pack.cursor!);
    const before = f.pack.snapshot();
    if (cancel !== "empty") drag.visit(cell(0), f.getStack);
    if (cancel === "explicit") drag.cancel();
    assert.equal(drag.finish(cancel !== "outside", f.getStack), null);
    assert(!drag.visit(cell(1), f.getStack));
    assert.deepEqual(f.pack.snapshot(), before);
  }
});

test("Concurrent chest changes revalidate the preview before release instead of overwriting a new item", () => {
  const f = dragFixture({ id: 8, n: 12 }),
    drag = new HeldCursorDrag(f.pack.cursor!);
  drag.visit(cell(0, "chest"), f.getStack);
  drag.visit(cell(0), f.getStack);
  f.chest[0] = { id: 9, n: 17 };
  const action = drag.finish(true, f.getStack);
  assert.deepEqual(action, { type: "distribute", slots: [cell(0)], right: false });
  assert(applyInventoryGesture(f.pack, action!, f.chest));
  assert.deepEqual(f.chest[0], { id: 9, n: 17 });
  assert.deepEqual(f.pack.slots[0], { id: 8, n: 12 });
});

test("Panel-specific rejected fields do not affect the split or consume a visit", () => {
  const f = dragFixture({ id: 8, n: 5 }),
    drag = new HeldCursorDrag(f.pack.cursor!);
  const accepts = (slot: SlotRef) => slot.index !== 1;
  assert(!drag.visit(cell(1), f.getStack, accepts));
  assert(drag.visit(cell(0), f.getStack, accepts));
  assert(drag.visit(cell(2), f.getStack, accepts));
  assert.deepEqual(
    drag.preview(f.getStack, accepts).slots.map((s) => s.added),
    [2, 2],
  );
  assert.deepEqual(drag.preview(f.getStack, accepts).cursor, { id: 8, n: 1 });
});

test("Fast pointer path crosses intermediate slots and keeps its final coordinates", () => {
  const from = { x: 5, y: 20 },
    to = { x: 310, y: 90 },
    path = pointerPath(from, to);
  let previous = from;
  for (const at of path) {
    assert(Math.hypot(at.x - previous.x, at.y - previous.y) <= 8.00001);
    previous = at;
  }
  assert.deepEqual(path.at(-1), to);
  // Six narrow cells with gaps must all be hit even if the browser supplies just two events.
  const touched = new Set(
    pointerPath({ x: 5, y: 0 }, { x: 285, y: 0 })
      .filter((at) => at.x % 50 < 40)
      .map((at) => Math.floor(at.x / 50)),
  );
  assert.deepEqual([...touched], [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(pointerPath(from, from), [from]);
});

test("Floating item count and distribution label remain visible at viewport corners", () => {
  const viewport = { width: 320, height: 480 };
  for (const touch of [false, true])
    for (const distribution of [false, true]) {
      const low = slotCursorPosition({ x: -3, y: -3, touch }, viewport, distribution);
      const high = slotCursorPosition({ x: 320, y: 480, touch }, viewport, distribution);
      assert(low.x >= 4 && low.y >= 4);
      assert(high.x + (distribution ? 150 : 58) <= viewport.width - 4);
      assert(high.y + (distribution ? 78 : 54) <= viewport.height - 4);
    }
  assert(
    slotCursorPosition({ x: 120, y: 200, touch: true }, viewport).y < 200,
    "touch preview is above the finger",
  );
});
