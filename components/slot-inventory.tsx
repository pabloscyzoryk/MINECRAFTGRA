"use client";
import { useState, type ComponentType, type CSSProperties } from "react";
import { ArrowRight, BookOpen, PackageOpen, Shield, Search, Trash2 } from "lucide-react";
import { InventoryAvatar } from "./skin-editor";
import { GRID_RECIPES, type Stack } from "@/lib/inventory";
import { BLOCKS, ITEMS, item } from "@/lib/blocks";
import type { Game, Snapshot } from "@/lib/engine";
import { inventoryGesture } from "@/lib/inventory-actions";
import { useSlotGestures } from "@/hooks/use-slot-gestures";
import { SlotCursor } from "./slot-cursor";
type Area = "slots" | "grid";
export default function SlotInventory({
  game,
  snap,
  Icon,
}: {
  game: Game;
  snap: Snapshot;
  Icon: ComponentType<{ id: number; size?: number }>;
}) {
  const [book, setBook] = useState(false),
    [catalog, setCatalog] = useState(false),
    [query, setQuery] = useState("");
  const p = snap.pack;
  const gestures = useSlotGestures({
    cursor: p.cursor,
    getStack: (slot) => slot.area === "result" ? snap.craftResult
      : slot.area === "slots" || slot.area === "grid" ? p[slot.area][slot.index] ?? null : null,
    dispatch: (action) => inventoryGesture(game, action),
  });
  const slot = (area: Area, index: number) => {
    const s = p[area][index],
      name = s ? item(s.id).name + " ×" + s.n : "Puste pole";
    return (
      <button
        key={area + index}
        className={"mc-slot " + (area === "slots" && index === snap.selected ? "chosen" : "")}
        aria-label={name}
        title={name}
        {...gestures.slotProps({ area, index })}
      >
        {s && (
          <>
            <Icon id={s.id} size={30} />
            {s.n > 1 && <span className="mc-count">{s.n}</span>}
          </>
        )}
        {area === "slots" && index < 9 && <small className="mc-slot-number">{index + 1}</small>}
      </button>
    );
  };
  const cursor = p.cursor as Stack | null;
  return (
    <div className="mc-inventory" ref={gestures.panelRef}>
      {cursor && (
        <div className="mobile-held-item">
          <Icon id={cursor.id} size={22} />
          {item(cursor.id).name} ×{cursor.n} — dotknij pola
        </div>
      )}
      <div className="mc-top">
        <div className="mc-character">
          <div className="mc-equipment">
            <span>Pancerz</span>
            <button
              className={"mc-slot armor-slot " + (snap.adventure.armor ? "equipped" : "")}
              title={
                snap.adventure.armor
                  ? "Zdejmij napierśnik"
                  : "Wybierz napierśnik w plecaku i kliknij tutaj"
              }
              onClick={() => {
                const armor = p.cursor?.id;
                if (armor === 121 || armor === 122) {
                  game.adventure.equipArmor(armor);
                  game.emit();
                } else if (snap.adventure.armor) {
                  game.adventure.equipArmor(snap.adventure.armor);
                  game.emit();
                }
              }}
            >
              {snap.adventure.armor ? (
                <Icon id={snap.adventure.armor} size={30} />
              ) : (
                <Shield size={27} />
              )}
            </button>
            <small>{snap.adventure.armor ? "Założony" : "Brak"}</small>
          </div>
          <InventoryAvatar heldId={snap.hotbar[snap.selected] ?? 0} />
        </div>
        <div className="mc-crafting">
          <h3>
            Wytwarzanie{" "}
            <small>
              {p.size} × {p.size}
            </small>
          </h3>
          <div className="mc-crafting-row">
            <div className="mc-grid craft-grid" style={{ "--cols": p.size } as CSSProperties}>
              {Array.from({ length: p.size * p.size }, (_, i) => slot("grid", i))}
            </div>
            <ArrowRight className="mc-craft-arrow" />
            <button
              className="mc-slot mc-result"
              disabled={!snap.craftResult}
              title={
                snap.craftResult
                  ? "Wytwórz: " + item(snap.craftResult.id).name
                  : "Ułóż składniki według przepisu"
              }
              aria-label={snap.craftResult ? "Wynik wytwarzania: " + item(snap.craftResult.id).name + " ×" + snap.craftResult.n : "Wynik wytwarzania: puste"}
              {...gestures.slotProps({ area: "result", index: 0 })}
            >
              {snap.craftResult && (
                <>
                  <Icon id={snap.craftResult.id} size={35} />
                  {snap.craftResult.n > 1 && <span className="mc-count">{snap.craftResult.n}</span>}
                </>
              )}
            </button>
          </div>
          <button
            className={"mc-book-toggle " + (book ? "active" : "")}
            onClick={() => {
              setBook(!book);
              setCatalog(false);
            }}
          >
            <BookOpen size={17} />
            Księga receptur
          </button>
          {p.size === 2 && <p>Większe przepisy wymagają stołu rzemieślniczego.</p>}
        </div>
      </div>
      <div className="mc-storage-label">
        <h3>Ekwipunek</h3>
        {snap.mode === "creative" && (
          <button
            onClick={() => {
              setCatalog(!catalog);
              setBook(false);
            }}
          >
            <PackageOpen size={15} />
            Katalog kreatywny
          </button>
        )}
      </div>
      <div className="mc-grid mc-storage">
        {Array.from({ length: 27 }, (_, i) => slot("slots", i + 9))}
      </div>
      <div className="mc-grid mc-hotbar">
        {Array.from({ length: 9 }, (_, i) => slot("slots", i))}
      </div>
      <div className="mc-footer">
        <p>
          Przeciągnij stos lub kliknij dwa pola · 2× LPM: zbierz takie same do stosu · PPM: podziel
          / odłóż 1 · Shift + klik: szybkie przenoszenie. Trzymany stos: przeciągnij LPM — podziel równo, PPM — po 1.
          <span className="inventory-touch-help">
            Na telefonie przytrzymaj chwilę stos i przeciągnij. Szybki ruch w pionie przewija panel.
          </span>
        </p>
        <button
          disabled={!cursor}
          onClick={() => game.dropCursor()}
          title="Wyrzuć stos trzymany kursorem"
        >
          <Trash2 size={15} />
        </button>
      </div>
      {(book || catalog) && (
        <div className="mc-recipe-book">
          <div className="mc-book-search">
            <Search size={15} />
            <input
              aria-label="Szukaj w księdze"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={catalog ? "Szukaj bloku lub przedmiotu…" : "Szukaj receptury…"}
            />
          </div>
          <div className="mc-book-items">
            {catalog
              ? [...BLOCKS.slice(1), ...ITEMS]
                  .filter((b) =>
                    b.name.toLocaleLowerCase("pl").includes(query.toLocaleLowerCase("pl")),
                  )
                  .map((b) => (
                    <button key={b.id} onClick={() => game.equip(b.id)} title={b.name}>
                      <Icon id={b.id} size={26} />
                      <span>{b.name}</span>
                    </button>
                  ))
              : GRID_RECIPES.map((r, i) => ({ r, i }))
                  .filter(({ r }) => !r.furnace)
                  .filter(({ r }) =>
                    item(r.out)
                      .name.toLocaleLowerCase("pl")
                      .includes(query.toLocaleLowerCase("pl")),
                  )
                  .map(({ r, i }) => (
                    <button
                      key={i}
                      className={
                        r.pattern.length > p.size || r.pattern[0].length > p.size
                          ? "needs-table"
                          : ""
                      }
                      onClick={() => game.fillCraft(i)}
                      title={
                        item(r.out).name +
                        " · " +
                        (r.furnace
                          ? "wymaga pieca w pobliżu"
                          : r.pattern.length > 2 || r.pattern[0].length > 2
                            ? "stół 3 × 3"
                            : "siatka 2 × 2")
                      }
                    >
                      <Icon id={r.out} size={26} />
                      <span>{item(r.out).name}</span>
                      <small>
                        {r.pattern.length > 2 || r.pattern[0].length > 2 ? "3×3" : "2×2"}
                      </small>
                    </button>
                  ))}
          </div>
        </div>
      )}
      <SlotCursor cursor={gestures.cursor} Icon={Icon} />
    </div>
  );
}
