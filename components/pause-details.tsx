"use client";
import { useRef, useState } from "react";
import { ArrowUpRight, Compass, Keyboard, BookOpen } from "lucide-react";
import { DIMENSIONS } from "@/lib/blocks";
import type { Snapshot, GameSettings } from "@/lib/engine";
import { keyName } from "@/lib/settings";

const tabs = ["Świat", "Dziennik", "Sterowanie"];
export default function PauseDetails({
  snap,
  settings,
  open,
}: {
  snap: Snapshot;
  settings: GameSettings;
  open: (panel: string) => void;
}) {
  const [tab, setTab] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <section className="pause-details" aria-label="Informacje o przygodzie">
      <div className="pause-details-tabs" role="tablist" aria-label="Świat, dziennik i sterowanie">
        {tabs.map((label, index) => (
          <button
            key={label}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            type="button"
            id={`pause-tab-${index}`}
            role="tab"
            aria-selected={tab === index}
            aria-controls={`pause-detail-${index}`}
            tabIndex={tab === index ? 0 : -1}
            onClick={() => setTab(index)}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % tabs.length
                  : event.key === "ArrowLeft"
                    ? (index + tabs.length - 1) % tabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : -1;
              if (next < 0) return;
              event.preventDefault();
              setTab(next);
              buttons.current[next]?.focus();
            }}
          >
            {index === 0 ? <Compass /> : index === 1 ? <BookOpen /> : <Keyboard />}
            {label}
          </button>
        ))}
      </div>
      <div
        className="pause-details-content"
        role="tabpanel"
        id={`pause-detail-${tab}`}
        aria-labelledby={`pause-tab-${tab}`}
        tabIndex={0}
      >
        {tab === 0 && (
          <>
            <strong>
              {DIMENSIONS[snap.dimension].name} <span>· {snap.biome}</span>
            </strong>
            <p>
              {snap.mode === "creative" ? "Tryb kreatywny" : "Przetrwanie"} · Dzień {snap.day} ·{" "}
              {snap.x} / {snap.y} / {snap.z}
            </p>
            {snap.target && (
              <p className="pause-inspected">
                Wskazany blok: <b>{snap.target}</b>
              </p>
            )}
          </>
        )}
        {tab === 1 && (
          <>
            <span className="pause-detail-label">Twój następny krok</span>
            <strong>{snap.objective}</strong>
            <button className="pause-detail-link" onClick={() => open("journal")}>
              Atlas i osiągnięcia <ArrowUpRight />
            </button>
          </>
        )}
        {tab === 2 && (
          <>
            <div className="pause-control-list">
              <span>
                <kbd>{settings.swapMouse ? "PPM" : "LPM"}</kbd> Kop / atakuj
              </span>
              <span>
                <kbd>{settings.swapMouse ? "LPM" : "PPM"}</kbd> Postaw / użyj / jedz
              </span>
              <span>
                <kbd>2× {keyName(settings.bindings.forward)}</kbd> Bieg
              </span>
              <span>
                <kbd>{keyName(settings.bindings.sneak)}</kbd> Kucanie / wstań z łóżka
              </span>
            </div>
            <button className="pause-detail-link" onClick={() => open("help")}>
              Wszystkie skróty i pomoc <ArrowUpRight />
            </button>
          </>
        )}
      </div>
    </section>
  );
}
