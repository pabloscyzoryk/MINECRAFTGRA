"use client";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Stack } from "../lib/inventory";
import type { InventoryGesture, SlotRef } from "../lib/inventory-actions";
import {
  InventoryClickSequence,
  sameSlot,
  slotMovement,
  slotReleaseKind,
} from "./slot-gesture-state";

type Options = {
  cursor: Stack | null;
  getStack: (slot: SlotRef) => Stack | null;
  dispatch: (gesture: InventoryGesture) => void;
};
type Position = { x: number; y: number; touch: boolean };
type Press = {
  id: number;
  slot: SlotRef;
  element: HTMLButtonElement;
  start: Position;
  previousY: number;
  time: number;
  pointerType: string;
  stack: Stack | null;
  source: Stack | null;
  heldCursor: boolean;
  mode: "pending" | "drag" | "scroll";
  quick: boolean;
  scroll: HTMLElement | null;
};

function scrollContainer(element: HTMLElement) {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (
      parent.scrollHeight > parent.clientHeight + 1 &&
      /auto|scroll/.test(getComputedStyle(parent).overflowY)
    )
      return parent;
  }
  return null;
}

export function useSlotGestures(options: Options) {
  const panelRef = useRef<HTMLDivElement>(null);
  const latest = useRef(options);
  latest.current = options;
  const press = useRef<Press | null>(null);
  const clicks = useRef(new InventoryClickSequence());
  const positionRef = useRef<Position | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [drag, setDrag] = useState<{ from: SlotRef; to: SlotRef | null; stack: Stack } | null>(
    null,
  );

  useEffect(() => {
    let frame = 0;
    const targetAt = (x: number, y: number): SlotRef | null => {
      const target = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-inventory-slot]");
      if (!target || !panelRef.current?.contains(target)) return null;
      const area = target.dataset.inventoryArea;
      const index = Number(target.dataset.inventoryIndex);
      return (area === "slots" || area === "grid" || area === "chest") && Number.isInteger(index)
        ? { area, index }
        : null;
    };
    const release = () => {
      const current = press.current;
      press.current = null;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      if (current?.element.hasPointerCapture?.(current.id))
        current.element.releasePointerCapture(current.id);
      setDrag(null);
    };
    const cancel = () => {
      release();
      clicks.current.reset();
    };
    const autoScroll = () => {
      const current = press.current;
      const at = positionRef.current;
      if (!current || current.mode !== "drag" || !at) return;
      const scroll = current.scroll;
      if (scroll) {
        const bounds = scroll.getBoundingClientRect();
        const delta = at.y < bounds.top + 35 ? -9 : at.y > bounds.bottom - 35 ? 9 : 0;
        if (delta && at.x > bounds.left && at.x < bounds.right) {
          scroll.scrollTop += delta;
          setDrag((value) => value && { ...value, to: targetAt(at.x, at.y) });
        }
      }
      frame = requestAnimationFrame(autoScroll);
    };
    const move = (event: PointerEvent) => {
      const current = press.current;
      if (current && current.id !== event.pointerId) return;
      const at = { x: event.clientX, y: event.clientY, touch: event.pointerType === "touch" };
      positionRef.current = at;
      setPosition(at);
      if (!current) return;
      if (event.cancelable) event.preventDefault();
      if (current.mode === "pending") {
        current.mode = slotMovement(
          current.pointerType,
          at.x - current.start.x,
          at.y - current.start.y,
          performance.now() - current.time,
        );
        if (current.mode === "drag" && !current.stack) current.mode = "scroll";
        if (current.mode === "drag") {
          clicks.current.reset();
          frame = requestAnimationFrame(autoScroll);
        }
      }
      if (current.mode === "scroll") current.scroll?.scrollBy(0, current.previousY - at.y);
      current.previousY = at.y;
      if (current.mode === "drag" && current.stack)
        setDrag({ from: current.slot, to: targetAt(at.x, at.y), stack: current.stack });
    };
    const up = (event: PointerEvent) => {
      const current = press.current;
      if (!current || current.id !== event.pointerId) return;
      if (event.cancelable) event.preventDefault();
      const to = targetAt(event.clientX, event.clientY);
      const releaseKind = slotReleaseKind(current.mode, current.slot, to);
      // Every drag is one atomic operation. Releasing outside or cancellation changes no stacks.
      if (releaseKind === "move" && to) {
        latest.current.dispatch({
          type: "move",
          from: current.slot,
          to,
          ...(current.slot.area === "chest" && !current.heldCursor
            ? { expected: current.source }
            : {}),
        });
      } else if (releaseKind === "click") {
        latest.current.dispatch(
          clicks.current.activate({
            slot: current.slot,
            slotId: latest.current.getStack(current.slot)?.id || current.stack?.id,
            cursorId: latest.current.cursor?.id,
            time: performance.now(),
            x: event.clientX,
            y: event.clientY,
            pointerType: current.pointerType,
            quick: current.quick,
          }),
        );
      } else clicks.current.reset();
      release();
    };
    const pointerCancel = (event: PointerEvent) => {
      if (press.current?.id === event.pointerId) cancel();
    };
    const visibility = () => {
      if (document.hidden) cancel();
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", pointerCancel);
    window.addEventListener("lostpointercapture", pointerCancel);
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", pointerCancel);
      window.removeEventListener("lostpointercapture", pointerCancel);
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", visibility);
      // No inventory operation is emitted if the dialog unmounts during a drag.
      const current = press.current;
      press.current = null;
      if (frame) cancelAnimationFrame(frame);
      if (current?.element.hasPointerCapture?.(current.id))
        current.element.releasePointerCapture(current.id);
    };
  }, []);

  const slotProps = (slot: SlotRef) => ({
    "data-inventory-slot": "",
    "data-inventory-area": slot.area,
    "data-inventory-index": slot.index,
    "data-drag-source": sameSlot(drag?.from ?? null, slot) || undefined,
    "data-drop-target": sameSlot(drag?.to ?? null, slot) || undefined,
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0 || !event.isPrimary || press.current) return;
      event.preventDefault();
      const at = { x: event.clientX, y: event.clientY, touch: event.pointerType === "touch" };
      positionRef.current = at;
      setPosition(at);
      const stack = latest.current.cursor || latest.current.getStack(slot);
      const source = latest.current.getStack(slot);
      press.current = {
        id: event.pointerId,
        slot,
        element: event.currentTarget,
        start: at,
        previousY: at.y,
        time: performance.now(),
        pointerType: event.pointerType,
        stack: stack ? { ...stack } : null,
        source: source ? { ...source } : null,
        heldCursor: !!latest.current.cursor,
        mode: "pending",
        quick: event.shiftKey,
        scroll: scrollContainer(event.currentTarget),
      };
      event.currentTarget.focus({ preventScroll: true });
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {}
    },
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
      // Native pointer click follows pointerup; only keyboard/assistive clicks reach this path.
      if (
        event.detail === 0 &&
        !("pointerType" in event.nativeEvent && event.nativeEvent.pointerType)
      ) {
        clicks.current.reset();
        latest.current.dispatch({ type: "click", slot, quick: event.shiftKey });
      }
      event.preventDefault();
    },
    onDoubleClick: (event: React.MouseEvent<HTMLButtonElement>) => event.preventDefault(),
    onContextMenu: (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      if (press.current?.pointerType === "touch") return;
      clicks.current.reset();
      latest.current.dispatch({ type: "click", slot, right: true });
    },
    onDragStart: (event: React.DragEvent<HTMLButtonElement>) => event.preventDefault(),
  });

  return {
    panelRef,
    slotProps,
    cursor:
      position && (drag?.stack || options.cursor)
        ? { ...position, stack: drag?.stack || options.cursor!, dragging: !!drag }
        : null,
  };
}
