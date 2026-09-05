import type { InventoryGesture, SlotRef } from "../lib/inventory-actions";

export const TOUCH_DRAG_HOLD_MS = 180;

export function sameSlot(a: SlotRef | null, b: SlotRef | null) {
  return !!a && !!b && a.area === b.area && a.index === b.index;
}

export function slotReleaseKind(
  mode: "pending" | "drag" | "scroll",
  from: SlotRef,
  to: SlotRef | null,
) {
  if (mode === "drag" && to && !sameSlot(from, to)) return "move";
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
