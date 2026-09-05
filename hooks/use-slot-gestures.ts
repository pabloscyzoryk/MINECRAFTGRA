"use client";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type CSSProperties,
} from "react";
import type { Stack } from "../lib/inventory";
import type { InventoryGesture, SlotRef } from "../lib/inventory-actions";
import { itemArt } from "../lib/item-art";
import {
  HeldCursorDrag,
  InventoryClickSequence,
  pointerPath,
  sameSlot,
  slotMovement,
  slotReleaseKind,
} from "./slot-gesture-state";

type Options = {
  cursor: Stack | null;
  getStack: (slot: SlotRef) => Stack | null;
  canPlace?: (slot: SlotRef, id: number) => boolean;
  dispatch: (gesture: InventoryGesture) => void;
  /** Optional non-inventory targets, such as wearable armor slots. True consumes the release. */
  onExternalDrop?: (drop: {
    from: SlotRef;
    source: Stack | null;
    stack: Stack | null;
    heldCursor: boolean;
    x: number;
    y: number;
  }) => boolean;
};
type Position = { x: number; y: number; touch: boolean };
type Press = {
  id: number;
  button: number;
  slot: SlotRef;
  element: HTMLButtonElement;
  start: Position;
  previous: Position;
  time: number;
  pointerType: string;
  stack: Stack | null;
  source: Stack | null;
  heldCursor: boolean;
  mode: "pending" | "drag" | "scroll";
  quick: boolean;
  scroll: HTMLElement | null;
  paint: HeldCursorDrag | null;
};
type DragView = {
  from: SlotRef;
  to: SlotRef | null;
  stack: Stack;
  paint: ReturnType<HeldCursorDrag["preview"]> | null;
  right: boolean;
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
  const [drag, setDrag] = useState<DragView | null>(null);

  useEffect(() => {
    let frame = 0;
    const targetAt = (x: number, y: number): SlotRef | null => {
      const target = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-inventory-slot]");
      if (!target || !panelRef.current?.contains(target)) return null;
      const area = target.dataset.inventoryArea;
      const index = Number(target.dataset.inventoryIndex);
      return (area === "slots" ||
        area === "grid" ||
        area === "chest" ||
        area === "furnace" ||
        area === "result") &&
        Number.isInteger(index)
        ? { area, index }
        : null;
    };
    const insidePanel = (x: number, y: number) => {
      const node = document.elementFromPoint(x, y);
      return !!node && !!panelRef.current?.contains(node);
    };
    const accepts = (slot: SlotRef, id: number) =>
      slot.area !== "result" && (latest.current.canPlace?.(slot, id) ?? true);
    const view = (current: Press, to: SlotRef | null) => {
      if (!current.stack) return;
      if (current.paint) current.paint.visit(to, latest.current.getStack, accepts);
      setDrag({
        from: current.slot,
        to: to?.area === "result" ? null : to,
        stack: current.stack,
        paint: current.paint?.preview(latest.current.getStack, accepts) ?? null,
        right: current.button === 2,
      });
    };
    const release = () => {
      const current = press.current;
      press.current = null;
      current?.paint?.cancel();
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
      const current = press.current,
        at = positionRef.current;
      if (!current || current.mode !== "drag" || !at) return;
      const scroll = current.scroll;
      if (scroll) {
        const bounds = scroll.getBoundingClientRect();
        const delta = at.y < bounds.top + 35 ? -9 : at.y > bounds.bottom - 35 ? 9 : 0;
        if (delta && at.x > bounds.left && at.x < bounds.right) {
          scroll.scrollTop += delta;
          view(current, targetAt(at.x, at.y));
        }
      }
      frame = requestAnimationFrame(autoScroll);
    };
    const paintPath = (current: Press, from: Position, to: Position) => {
      if (!current.paint) return;
      for (const at of pointerPath(from, to))
        current.paint.visit(targetAt(at.x, at.y), latest.current.getStack, accepts);
    };
    const advance = (current: Press, at: Position) => {
      if (current.mode === "pending") {
        current.mode = slotMovement(
          current.pointerType,
          at.x - current.start.x,
          at.y - current.start.y,
          performance.now() - current.time,
        );
        if (
          current.mode === "drag" &&
          (!current.stack || (current.button === 2 && !current.heldCursor))
        )
          current.mode = "scroll";
        if (current.mode === "drag") {
          clicks.current.reset();
          if (current.heldCursor && current.stack) {
            current.paint = new HeldCursorDrag(current.stack, current.button === 2);
            current.paint.visit(current.slot, latest.current.getStack, accepts);
            paintPath(current, current.start, at);
          }
          frame = requestAnimationFrame(autoScroll);
        }
      }
      if (current.mode === "scroll" && current.pointerType === "touch")
        current.scroll?.scrollBy(0, current.previous.y - at.y);
      if (current.mode === "drag") {
        paintPath(current, current.previous, at);
        view(current, targetAt(at.x, at.y));
      }
      current.previous = at;
    };
    const move = (event: PointerEvent) => {
      const current = press.current;
      if (current && current.id !== event.pointerId) return;
      if (
        current &&
        current.pointerType !== "touch" &&
        !(event.buttons & (current.button === 2 ? 2 : 1))
      ) {
        cancel();
        return;
      }
      const at = { x: event.clientX, y: event.clientY, touch: event.pointerType === "touch" };
      positionRef.current = at;
      setPosition(at);
      if (!current) return;
      if (event.cancelable) event.preventDefault();
      advance(current, at);
    };
    const up = (event: PointerEvent) => {
      const current = press.current;
      if (!current || current.id !== event.pointerId || current.button !== event.button) return;
      if (event.cancelable) event.preventDefault();
      const at = { x: event.clientX, y: event.clientY, touch: event.pointerType === "touch" };
      positionRef.current = at;
      setPosition(at);
      // A final pointermove can be coalesced away during a fast drag.
      advance(current, at);
      const to = targetAt(event.clientX, event.clientY);
      const releaseKind = slotReleaseKind(current.mode, current.slot, to);
      if (
        current.mode === "drag" &&
        !to &&
        insidePanel(event.clientX, event.clientY) &&
        latest.current.onExternalDrop?.({
          from: current.slot,
          source: current.source,
          stack: current.stack,
          heldCursor: current.heldCursor,
          x: event.clientX,
          y: event.clientY,
        })
      ) {
        clicks.current.reset();
      } else if (current.mode === "drag" && current.paint) {
        paintPath(current, current.previous, {
          x: event.clientX,
          y: event.clientY,
          touch: current.start.touch,
        });
        const action = current.paint.finish(
          insidePanel(event.clientX, event.clientY),
          latest.current.getStack,
          accepts,
        );
        if (action) latest.current.dispatch(action);
      } else if (releaseKind === "move" && to) {
        latest.current.dispatch({
          type: "move",
          from: current.slot,
          to,
          ...(["chest", "furnace", "result"].includes(current.slot.area) && !current.heldCursor
            ? { expected: current.source }
            : {}),
        });
      } else if (releaseKind === "click") {
        if (current.button === 2) {
          clicks.current.reset();
          latest.current.dispatch({
            type: "click",
            slot: current.slot,
            right: true,
            quick: current.quick,
          });
        } else
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
    const keyCancel = (event: KeyboardEvent) => {
      if (event.code === "Escape") cancel();
    };
    const capture = () => {
      if (document.pointerLockElement) cancel();
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", pointerCancel);
    window.addEventListener("lostpointercapture", pointerCancel);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", keyCancel, true);
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("pointerlockchange", capture);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", pointerCancel);
      window.removeEventListener("lostpointercapture", pointerCancel);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", keyCancel, true);
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("pointerlockchange", capture);
      const current = press.current;
      press.current = null;
      current?.paint?.cancel();
      if (frame) cancelAnimationFrame(frame);
      if (current?.element.hasPointerCapture?.(current.id))
        current.element.releasePointerCapture(current.id);
    };
  }, []);

  const slotProps = (slot: SlotRef) => {
    const preview = drag?.paint?.slots.find((entry) => sameSlot(entry.slot, slot));
    return {
      "data-inventory-slot": "",
      "data-inventory-area": slot.area,
      "data-inventory-index": slot.index,
      "data-drag-source": (!drag?.paint && sameSlot(drag?.from ?? null, slot)) || undefined,
      "data-drop-target": (!drag?.paint && sameSlot(drag?.to ?? null, slot)) || undefined,
      "data-paint-preview": !!preview || undefined,
      "data-preview-count": preview?.stack.n,
      style: preview
        ? ({ "--inventory-preview-image": `url("${itemArt(preview.stack.id)}")` } as CSSProperties)
        : undefined,
      onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (![0, 2].includes(event.button) || !event.isPrimary || press.current) return;
        event.preventDefault();
        const at = { x: event.clientX, y: event.clientY, touch: event.pointerType === "touch" };
        positionRef.current = at;
        setPosition(at);
        const source = latest.current.getStack(slot),
          stack = latest.current.cursor || source;
        press.current = {
          id: event.pointerId,
          button: event.button,
          slot,
          element: event.currentTarget,
          start: at,
          previous: at,
          time: performance.now(),
          pointerType: event.pointerType,
          stack: stack ? { ...stack } : null,
          source: source ? { ...source } : null,
          heldCursor: !!latest.current.cursor,
          mode: "pending",
          quick: event.shiftKey,
          scroll: scrollContainer(event.currentTarget),
          paint: null,
        };
        event.currentTarget.focus({ preventScroll: true });
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {}
      },
      onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
        // Pointerup already committed mouse/touch gestures; keyboard activation has detail zero.
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
        // Mouse right-click is handled on pointerup. Keep the keyboard context-menu shortcut.
        if (
          event.button === 0 &&
          event.detail === 0 &&
          !press.current &&
          !("pointerType" in event.nativeEvent && event.nativeEvent.pointerType)
        ) {
          clicks.current.reset();
          latest.current.dispatch({ type: "click", slot, right: true });
        }
      },
      onDragStart: (event: React.DragEvent<HTMLButtonElement>) => event.preventDefault(),
    };
  };
  const cursorStack = drag?.paint
    ? { id: drag.stack.id, n: drag.paint.cursor?.n ?? 0 }
    : drag?.stack || options.cursor;
  return {
    panelRef,
    slotProps,
    cursor:
      position && cursorStack
        ? {
            ...position,
            stack: cursorStack,
            dragging: !!drag,
            distribution: drag?.paint
              ? { count: drag.paint.slots.length, right: drag.right }
              : undefined,
          }
        : null,
  };
}
