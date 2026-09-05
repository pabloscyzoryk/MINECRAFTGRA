"use client";
import { createPortal } from "react-dom";
import type { ComponentType } from "react";
import type { Stack } from "@/lib/inventory";
import { slotCursorPosition } from "@/hooks/slot-gesture-state";

export function SlotCursor({
  cursor,
  Icon,
}: {
  cursor: {
    x: number;
    y: number;
    touch: boolean;
    dragging: boolean;
    stack: Stack;
    distribution?: { count: number; right: boolean };
  } | null;
  Icon: ComponentType<{ id: number; size?: number }>;
}) {
  if (!cursor || (cursor.touch && !cursor.dragging) || typeof document === "undefined") return null;
  const at = slotCursorPosition(
    cursor,
    { width: window.innerWidth, height: window.innerHeight },
    !!cursor.distribution,
  );
  return createPortal(
    <div
      className={"inventory-floating-stack " + (cursor.touch ? "touch-drag" : "")}
      aria-hidden="true"
      style={{
        transform: `translate3d(${at.x}px, ${at.y}px, 0)`,
      }}
    >
      <span className="inventory-cursor-amount" data-empty={cursor.stack.n === 0 || undefined}>
        <Icon id={cursor.stack.id} size={38} />
        <b>{cursor.stack.n}</b>
      </span>
      {cursor.distribution && (
        <small className="inventory-distribution-label">
          {cursor.distribution.right ? "Po 1" : "Równo"} · pola: {cursor.distribution.count}
        </small>
      )}
    </div>,
    document.body,
  );
}
