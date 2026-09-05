"use client";
import { useId } from "react";
import type { Difficulty } from "@/lib/difficulty";

export const DIFFICULTY_NAMES: Record<Difficulty, string> = {
  easy: "Łatwy",
  normal: "Średni",
  hard: "Trudny",
  horror: "Horror",
};
const options: { id: Difficulty; symbol: string; description: string }[] = [
  {
    id: "easy",
    symbol: "◇",
    description: "Łagodniejsze obrażenia, wolniejszy głód i szybszy powrót do zdrowia.",
  },
  {
    id: "normal",
    symbol: "◈",
    description: "Klasyczne przetrwanie. Zbieraj zapasy, buduj i odkrywaj.",
  },
  {
    id: "hard",
    symbol: "◆",
    description: "Mocniejsze ataki stworzeń, większy głód, trudniejsza regeneracja.",
  },
  {
    id: "horror",
    symbol: "◉",
    description: "Trudne przetrwanie. Ktoś obserwuje. Nie każde spotkanie jest przypadkiem.",
  },
];
export default function DifficultyPicker({
  value,
  onChange,
  online = false,
}: {
  value: Difficulty;
  onChange: (value: Difficulty) => void;
  online?: boolean;
}) {
  const group = useId();
  return (
    <fieldset className="difficulty-picker">
      <legend>Poziom trudności</legend>
      <div className="difficulty-grid">
        {options.map((option) => (
          <label
            key={option.id}
            className={`difficulty-card ${option.id} ${value === option.id ? "selected" : ""}`}
          >
            <input
              type="radio"
              name={group}
              value={option.id}
              checked={value === option.id}
              onChange={() => onChange(option.id)}
            />
            <span className="difficulty-symbol" aria-hidden="true">
              {option.symbol}
            </span>
            <span>
              <b>{DIFFICULTY_NAMES[option.id]}</b>
              <small>{option.description}</small>
            </span>
          </label>
        ))}
      </div>
      {value === "horror" && (
        <div className="horror-introduction">
          <b>GOŚĆ · Nie jesteś tu sam.</b>
          <p>
            Najpierw cisza. Potem kroki, których nie zrobiłeś. Po kilku minutach obserwacja może
            przerodzić się w polowanie. Oddal się, wykorzystaj przeszkody i zejdź z drogi
            zapowiadanego skoku. Gościa można pokonać kontratakami, lecz ucieczka jest
            bezpieczniejsza. Schwytanie kończy się jumpscare’em i śmiercią postaci.
          </p>
          <small>Głośność horroru i nagłe straszenia możesz zmienić w ustawieniach dźwięku.</small>
        </div>
      )}
      {online && (
        <p className="panel-footnote">
          Wszyscy gracie w jednym świecie. Trudność dotyczy Twojego przetrwania; zasady PvP
          pozostają równe. Gość nawiedza tylko graczy, którzy wybrali Horror. Możecie spotkać go
          razem.
        </p>
      )}
    </fieldset>
  );
}
