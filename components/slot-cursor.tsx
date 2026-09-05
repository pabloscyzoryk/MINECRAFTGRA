"use client";
import { createPortal } from "react-dom";
import type { ComponentType } from "react";
import type { Stack } from "@/lib/inventory";

export function SlotCursor({
  cursor,
  Icon,
}: {
  cursor: { x: number; y: number; touch: boolean; dragging: boolean; stack: Stack } | null;
  Icon: ComponentType<{ id: number; size?: number }>;
}) {
  if (!cursor || (cursor.touch && !cursor.dragging) || typeof document === "undefined") return null;
  return createPortal(
    <div
      className={"inventory-floating-stack " + (cursor.touch ? "touch-drag" : "")}
      aria-hidden="true"
      style={{
        left: cursor.x + (cursor.touch ? -20 : 12),
        top: cursor.y + (cursor.touch ? -58 : 12),
      }}
    >
      <Icon id={cursor.stack.id} size={38} />
      <b>{cursor.stack.n}</b>
    </div>,
    document.body,
  );
}
