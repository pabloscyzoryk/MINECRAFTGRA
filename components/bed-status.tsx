"use client";
import { BedDouble, LogOut, Moon, Sun } from "lucide-react";

export default function BedStatus({
  elapsed,
  night,
  nightSkipped,
  exitKey,
  onExit,
}: {
  elapsed: number;
  night: boolean;
  nightSkipped: boolean;
  exitKey: string;
  onExit: () => void;
}) {
  const seconds = Math.max(0, Math.ceil(10 - elapsed));
  return (
    <section className="bed-rest-hud" aria-label="Odpoczynek w łóżku">
      <BedDouble size={23} aria-hidden="true" />
      <div className="bed-rest-copy">
        <strong>
          {night ? "Za chwilę nowy dzień" : nightSkipped ? "Dzień dobry!" : "Chwila odpoczynku"}
        </strong>
        <span>
          {night ? (
            <>
              <Moon size={11} /> Pozostań w łóżku jeszcze {seconds} s
            </>
          ) : (
            <>
              <Sun size={11} />{" "}
              {nightSkipped ? "Noc minęła. Możesz wstać." : "Jest dzień. Odpoczywaj, ile chcesz."}
            </>
          )}
        </span>
        {night && (
          <div
            className="bed-rest-progress"
            role="progressbar"
            aria-label="Czas do poranka"
            aria-valuemin={0}
            aria-valuemax={10}
            aria-valuenow={Math.min(10, Math.max(0, elapsed))}
          >
            <i style={{ width: Math.min(100, Math.max(0, elapsed) * 10) + "%" }} />
          </div>
        )}
      </div>
      <button onClick={onExit}>
        <LogOut size={15} />
        <span>Wstań</span>
        <kbd>{exitKey}</kbd>
      </button>
    </section>
  );
}
