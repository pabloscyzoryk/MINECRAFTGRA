"use client";
import type { Game, Snapshot } from "@/lib/engine";
import { ItemIcon } from "@/lib/item-art";
import { item } from "@/lib/blocks";
import type { Stack } from "@/lib/inventory";
import { inventoryGesture } from "@/lib/inventory-actions";
import { useSlotGestures } from "@/hooks/use-slot-gestures";
import { SlotCursor } from "./slot-cursor";

export default function ChestInventory({ game, snap }: { game: Game; snap: Snapshot }) {
  const slots = snap.adventure.chestSlots;
  const gestures = useSlotGestures({
    cursor: snap.pack.cursor,
    getStack: (slot) =>
      slot.area === "chest"
        ? (slots[slot.index] ?? null)
        : (snap.pack[slot.area][slot.index] ?? null),
    dispatch: (action) => inventoryGesture(game, action, true),
  });
  const slot = (stack: Stack | null, index: number, area: "slots" | "chest") => (
    <button
      key={area + index}
      className="chest-slot"
      aria-label={
        (area === "chest" ? "Skrzynia" : "Ekwipunek") +
        " pole " +
        (index + 1) +
        ": " +
        (stack ? item(stack.id).name + " ×" + stack.n : "puste")
      }
      title={stack ? item(stack.id).name : "Puste pole"}
      {...gestures.slotProps({ area, index })}
    >
      <ItemIcon id={stack?.id ?? 0} />
      {stack && stack.n > 1 && <b>{stack.n}</b>}
    </button>
  );
  return (
    <div className="chest-inventory" ref={gestures.panelRef}>
      <div className="chest-capacity">
        <h3>Skrzynia</h3>
        <span>{slots.filter((s) => !s).length} / 27 wolnych pól</span>
      </div>
      <div className="chest-slot-grid">{slots.map((s, i) => slot(s, i, "chest"))}</div>
      <div className="chest-cursor" aria-live="polite">
        {snap.pack.cursor ? (
          <>
            <ItemIcon id={snap.pack.cursor.id} size={25} />
            <span>
              {item(snap.pack.cursor.id).name} ×{snap.pack.cursor.n} — wybierz pole
            </span>
          </>
        ) : (
          <span>Przeciągnij stos lub kliknij stos, a potem pole docelowe</span>
        )}
      </div>
      <h3>Plecak</h3>
      <div className="chest-slot-grid">
        {snap.pack.slots.slice(9).map((s, i) => slot(s, i + 9, "slots"))}
      </div>
      <h3>Pasek podręczny</h3>
      <div className="chest-slot-grid">
        {snap.pack.slots.slice(0, 9).map((s, i) => slot(s, i, "slots"))}
      </div>
      <p className="panel-footnote">
        Przeciągnij stos lub kliknij dwa pola. 2× LPM zbiera takie same przedmioty do jednego stosu.
        PPM dzieli / odkłada 1. Shift + klik przenosi stos między skrzynią a plecakiem.
        <span className="inventory-touch-help">
          Na telefonie przytrzymaj chwilę stos i przeciągnij. Szybki ruch w pionie przewija panel.
        </span>
      </p>
      <SlotCursor cursor={gestures.cursor} Icon={ItemIcon} />
    </div>
  );
}
