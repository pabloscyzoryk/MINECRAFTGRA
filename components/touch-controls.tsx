"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Backpack, MessageSquare, Pause, Pickaxe, Plus, Shield } from "lucide-react";
import type { Game } from "@/lib/engine";
export default function TouchControls({
  game,
  open,
}: {
  game: Game;
  open: (panel: string) => void;
}) {
  const pad = useRef<HTMLDivElement>(null),
    pointer = useRef<number | null>(null),
    [stick, setStick] = useState({ x: 0, y: 0 });
  useEffect(
    () => () => {
      for (const key of ["KeyW", "KeyS", "KeyA", "KeyD", "Space", "ShiftLeft"])
        game.keys.delete(key);
      game.leftDown = false;
      game.rightDown = false;
      game.sprinting = false;
    },
    [game],
  );
  const move = (x: number, y: number) => {
    const rect = pad.current!.getBoundingClientRect();
    let dx = x - (rect.left + rect.width / 2),
      dy = y - (rect.top + rect.height / 2);
    const length = Math.hypot(dx, dy);
    if (length > 45) {
      dx = (dx / length) * 45;
      dy = (dy / length) * 45;
    }
    setStick({ x: dx, y: dy });
    for (const key of ["KeyW", "KeyS", "KeyA", "KeyD"]) game.keys.delete(key);
    if (dy < -12) game.keys.add("KeyW");
    if (dy > 12) game.keys.add("KeyS");
    if (dx < -12) game.keys.add("KeyA");
    if (dx > 12) game.keys.add("KeyD");
    game.sprinting = dy < -35;
  };
  const release = () => {
    pointer.current = null;
    setStick({ x: 0, y: 0 });
    for (const k of ["KeyW", "KeyS", "KeyA", "KeyD"]) game.keys.delete(k);
    game.sprinting = false;
  };
  const hold = (on: () => void, off: () => void) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      on();
    },
    onPointerUp: off,
    onPointerCancel: off,
    onLostPointerCapture: off,
  });
  return (
    <div className="mobile-controls">
      <div className="mobile-quick">
        <button onClick={() => open("pause")} aria-label="Pauza">
          <Pause />
        </button>
        <button onClick={() => open("inventory")} aria-label="Ekwipunek">
          <Backpack />
        </button>
        {game.net && (
          <button onClick={() => open("chat")} aria-label="Czat">
            <MessageSquare />
          </button>
        )}
      </div>
      <div
        ref={pad}
        className="mobile-stick"
        onPointerDown={(e) => {
          e.preventDefault();
          if (pointer.current !== null) return;
          pointer.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          move(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (pointer.current === e.pointerId) move(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          if (pointer.current === e.pointerId) release();
        }}
        onPointerCancel={(e) => {
          if (pointer.current === e.pointerId) release();
        }}
        onLostPointerCapture={(e) => {
          if (pointer.current === e.pointerId) release();
        }}
      >
        <span style={{ transform: `translate(${stick.x}px,${stick.y}px)` }} />
      </div>
      <div className="mobile-actions">
        <button
          {...hold(
            () => {
              game.leftDown = true;
              game.attack();
            },
            () => {
              game.leftDown = false;
              game.mining = 0;
            },
          )}
        >
          <Pickaxe />
          <small>Kop / atak</small>
        </button>
        <button
          {...hold(
            () => {
              game.rightDown = true;
              game.interact();
            },
            () => {
              game.rightDown = false;
            },
          )}
        >
          <Plus />
          <small>Postaw / użyj</small>
        </button>
        <button
          {...hold(
            () => game.keys.add("Space"),
            () => game.keys.delete("Space"),
          )}
        >
          <ArrowUp />
          <small>Skok</small>
        </button>
        <button
          {...hold(
            () => game.keys.add("ShiftLeft"),
            () => game.keys.delete("ShiftLeft"),
          )}
        >
          <Shield />
          <small>Kucaj</small>
        </button>
      </div>
    </div>
  );
}
