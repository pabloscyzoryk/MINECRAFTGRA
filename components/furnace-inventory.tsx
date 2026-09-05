"use client";
import { Flame, ArrowRight } from "lucide-react";
import type { Game, Snapshot } from "@/lib/engine";
import { ItemIcon } from "@/lib/item-art";
import { item } from "@/lib/blocks";
import { maxStack, type Stack } from "@/lib/inventory";
import { furnaceRecipe, FURNACE_RECIPES } from "@/lib/furnace";
import { inventoryGesture } from "@/lib/inventory-actions";
import { useSlotGestures } from "@/hooks/use-slot-gestures";
import { SlotCursor } from "./slot-cursor";

export default function FurnaceInventory({ game, snap }: { game: Game; snap: Snapshot }) {
  const furnace = snap.adventure.furnace;
  const gestures = useSlotGestures({
    cursor: snap.pack.cursor,
    getStack: (slot) => slot.area === "furnace" ? furnace?.slots[slot.index] ?? null
      : slot.area === "slots" ? snap.pack.slots[slot.index] ?? null : null,
    dispatch: (action) => inventoryGesture(game, action, "furnace"),
  });
  if (!furnace) return <p>Piec jest niedostępny.</p>;
  const recipe = furnaceRecipe(furnace.slots[0]?.id ?? 0);
  const result = furnace.slots[2];
  const blocked = !!(result && recipe && (result.id !== recipe.output || result.n >= maxStack(result.id)));
  const progress = Math.min(100, furnace.progress / (recipe?.seconds ?? 10) * 100);
  const burn = furnace.burnTotal ? Math.max(0, furnace.burnRemaining / furnace.burnTotal * 100) : 0;
  const status = !furnace.slots[0] ? "Włóż surowiec do górnego pola."
    : !recipe ? "Ten przedmiot nie ma przepisu przetapiania."
    : blocked ? "Odbierz wynik, aby zwolnić miejsce."
    : furnace.burnRemaining > 0 ? "Przetapianie…"
    : "Dodaj paliwo do dolnego pola.";
  const cell = (stack: Stack | null, index: number, area: "slots" | "furnace") => {
    const label = area === "furnace" ? ["Surowiec", "Paliwo", "Wynik"][index] : "Ekwipunek pole " + (index + 1);
    return <button key={area + index} className={"chest-slot " + (area === "furnace" && index === 2 ? "furnace-result" : "")}
      aria-label={label + ": " + (stack ? item(stack.id).name + " ×" + stack.n : "puste")}
      title={label + (stack ? " · " + item(stack.id).name : " · Puste pole")}
      {...gestures.slotProps({ area, index })}>
      <ItemIcon id={stack?.id ?? 0} />{stack && stack.n > 1 && <b>{stack.n}</b>}
    </button>;
  };
  return <div className="chest-inventory furnace-inventory" ref={gestures.panelRef}>
    <div className="furnace-workspace">
      <div className="furnace-inputs">
        <span>Surowiec</span>{cell(furnace.slots[0], 0, "furnace")}
        <div className="furnace-flame" role="progressbar" aria-label="Pozostałe paliwo" aria-valuenow={Math.round(burn)} aria-valuemin={0} aria-valuemax={100}>
          <Flame /><span style={{ clipPath: `inset(${100 - burn}% 0 0)` }}><Flame /></span>
        </div>
        {cell(furnace.slots[1], 1, "furnace")}<span>Paliwo</span>
      </div>
      <div className="furnace-progress" role="progressbar" aria-label="Postęp przetapiania" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
        <ArrowRight /><span style={{ clipPath: `inset(0 ${100 - progress}% 0 0)` }}><ArrowRight /></span>
        <small>{Math.round(progress)}%</small>
      </div>
      <div className="furnace-output"><span>Wynik</span>{cell(result, 2, "furnace")}</div>
      <div className="furnace-status"><strong>{status}</strong><p>Węgiel, drewno, deski lub patyki.<br />Piec pracuje także po zamknięciu okna.</p></div>
    </div>
    <h3>Plecak</h3><div className="chest-slot-grid">{snap.pack.slots.slice(9).map((s, i) => cell(s, i + 9, "slots"))}</div>
    <h3>Pasek podręczny</h3><div className="chest-slot-grid">{snap.pack.slots.slice(0, 9).map((s, i) => cell(s, i, "slots"))}</div>
    <p className="panel-footnote">Shift + klik dobiera pole pieca lub zabiera stos do plecaka. LPM przenosi, PPM dzieli / odkłada 1. Trzymając stos, przeciągnij po polach, aby go rozdzielić. Dwuklik zbiera pasujące przedmioty.
      <span className="inventory-touch-help">Na telefonie przytrzymaj stos i przeciągnij. Szybki ruch w pionie przewija panel.</span></p>
    <details className="furnace-recipes"><summary>Co można przetopić?</summary><div>{FURNACE_RECIPES.map(r => <span key={r.input}><ItemIcon id={r.input} size={24} />{item(r.input).name}<ArrowRight size={16} /><ItemIcon id={r.output} size={24} />{item(r.output).name}</span>)}</div></details>
    <SlotCursor cursor={gestures.cursor} Icon={ItemIcon} />
  </div>;
}
