import test from "node:test";
import assert from "node:assert/strict";
import {
  InventoryClickSequence,
  sameSlot,
  slotMovement,
  slotReleaseKind,
} from "../hooks/slot-gesture-state";

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
});
