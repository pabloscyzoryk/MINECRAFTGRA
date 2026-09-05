import type { InventoryGesture, SlotRef } from "../lib/inventory-actions";
import type { Stack } from "../lib/inventory";
import { planDistribution } from "../lib/inventory-gestures";

export const TOUCH_DRAG_HOLD_MS = 180;

export function sameSlot(a: SlotRef | null, b: SlotRef | null) {
  return !!a && !!b && a.area === b.area && a.index === b.index;
}

export function slotReleaseKind(
  mode: "pending" | "drag" | "scroll",
  from: SlotRef,
  to: SlotRef | null,
) {
  if (mode === "drag" && to && to.area !== "result" && !sameSlot(from, to)) return "move";
  if (mode === "pending" && sameSlot(from, to)) return "click";
  return "cancel";
}

/** A quick vertical touch swipes the panel; a held touch can drag in any direction. */
export function slotMovement(pointerType: string, dx: number, dy: number, elapsed: number) {
  if (Math.hypot(dx, dy) < (pointerType === "touch" ? 12 : 5)) return "pending";
  if (pointerType === "touch" && elapsed < TOUCH_DRAG_HOLD_MS && Math.abs(dy) > Math.abs(dx) * 1.15)
    return "scroll";
  return "drag";
}

/** Sample fast pointer motion so it cannot skip narrow slots between two browser events. */
export function pointerPath(from: { x: number; y: number }, to: { x: number; y: number }) {
  const steps = Math.max(1, Math.min(256, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 8)));
  return Array.from({ length: steps }, (_, index) => ({
    x: from.x + ((to.x - from.x) * (index + 1)) / steps,
    y: from.y + ((to.y - from.y) * (index + 1)) / steps,
  }));
}

/** Keep the stack and its distribution badge visible near any viewport edge. */
export function slotCursorPosition(
  at: { x: number; y: number; touch: boolean },
  viewport: { width: number; height: number },
  distribution = false,
) {
  const width = distribution ? 150 : 58,
    height = distribution ? 78 : 54;
  return {
    x: Math.max(4, Math.min(at.x + (at.touch ? -24 : 12), viewport.width - width - 4)),
    y: Math.max(4, Math.min(at.y + (at.touch ? -height - 12 : 12), viewport.height - height - 4)),
  };
}

/** A drag only proposes changes. Cancellation never edits the held stack or any slot. */
export class HeldCursorDrag {
  readonly cursor: Stack;
  private visited: SlotRef[] = [];
  private closed = false;
  constructor(
    cursor: Stack,
    readonly right = false,
  ) {
    this.cursor = { ...cursor };
  }
  visit(
    slot: SlotRef | null,
    getStack: (slot: SlotRef) => Stack | null,
    accepts = (_slot: SlotRef, _id: number) => true,
  ) {
    if (this.closed || !slot || this.visited.some((old) => sameSlot(old, slot))) return false;
    const planned = planDistribution(
      this.cursor,
      [...this.visited, slot],
      getStack,
      accepts,
      this.right,
    );
    if (!planned.slots.some((entry) => sameSlot(entry.slot, slot))) return false;
    this.visited = planned.slots.map((entry) => ({ ...entry.slot }));
    return true;
  }
  preview(
    getStack: (slot: SlotRef) => Stack | null,
    accepts = (_slot: SlotRef, _id: number) => true,
  ) {
    return planDistribution(
      this.cursor,
      this.closed ? [] : this.visited,
      getStack,
      accepts,
      this.right,
    );
  }
  finish(
    insidePanel: boolean,
    getStack: (slot: SlotRef) => Stack | null,
    accepts = (_slot: SlotRef, _id: number) => true,
  ): InventoryGesture | null {
    if (this.closed) return null;
    const slots = insidePanel
      ? this.preview(getStack, accepts).slots.map((entry) => entry.slot)
      : [];
    this.cancel();
    return slots.length ? { type: "distribute", slots, right: this.right } : null;
  }
  cancel() {
    this.closed = true;
    this.visited = [];
  }
}

type Activation = {
  slot: SlotRef;
  slotId?: number;
  cursorId?: number;
  time: number;
  x: number;
  y: number;
  pointerType: string;
  quick?: boolean;
};

/** Remember the first item before a delayed server response empties its source slot. */
export class InventoryClickSequence {
  private last: (Activation & { id: number }) | null = null;

  reset() {
    this.last = null;
  }

  activate(now: Activation): InventoryGesture {
    const id = now.cursorId || now.slotId || 0;
    const last = this.last;
    const double =
      !now.quick &&
      now.pointerType !== "keyboard" &&
      last &&
      sameSlot(last.slot, now.slot) &&
      last.pointerType === now.pointerType &&
      now.time >= last.time &&
      now.time - last.time <= 330 &&
      Math.hypot(now.x - last.x, now.y - last.y) <= (now.pointerType === "touch" ? 24 : 8) &&
      (!id || id === last.id);
    if (double) {
      this.reset();
      return { type: "collect", id: last.id };
    }
    this.last = id && !now.quick && now.pointerType !== "keyboard" ? { ...now, id } : null;
    return { type: "click", slot: now.slot, quick: now.quick };
  }
}
