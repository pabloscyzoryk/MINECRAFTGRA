"use client";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  LockKeyhole,
  RotateCcw,
  ShieldAlert,
  UnlockKeyhole,
} from "lucide-react";
import type { Multiplayer } from "@/lib/multiplayer";
import "@/app/world-admin.css";

type Authorization = { seed: number; worldId: string; expiresAt: number };
type Confirmation = { seed: number | null; worldId: string };

export function parseWorldSeed(value: string): number | null {
  const text = value.trim();
  if (!/^-?\d+$/.test(text)) return null;
  const seed = Number(text);
  return Number.isInteger(seed) && seed >= -2147483648 && seed <= 2147483647 ? seed : null;
}

export default function WorldAdminSettings({ net }: { net: Multiplayer }) {
  const id = useId();
  const [password, setPassword] = useState("");
  const [authorization, setAuthorization] = useState<Authorization | null>(null);
  const [choice, setChoice] = useState<"random" | "custom">("random");
  const [seedText, setSeedText] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [pending, setPending] = useState<"unlock" | "reset" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(net.worldResetNotice || "");
  const [connected, setConnected] = useState(net.connected && !net.closed);
  const [now, setNow] = useState(Date.now());
  const generation = useRef(0);
  const auth = useRef<Authorization | null>(null);
  const busy = useRef<"unlock" | "reset" | null>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);

  const lock = useCallback((message = "") => {
    generation.current++;
    auth.current = null;
    busy.current = null;
    setAuthorization(null);
    setConfirmation(null);
    setPending(null);
    setPassword("");
    setError(message);
  }, []);

  useEffect(() => {
    const sync = () => {
      const available = net.connected && !net.closed;
      const changedWorld = auth.current && auth.current.worldId !== net.worldId;
      setConnected(available);
      if (net.worldResetNotice) setNotice(net.worldResetNotice);
      if (!available && (auth.current || busy.current))
        lock(
          changedWorld && net.worldResetNotice
            ? ""
            : "Połączenie zostało przerwane. Odblokuj dostęp ponownie po połączeniu.",
        );
      else if (auth.current && (changedWorld || !net.adminExpiresAt))
        lock(
          changedWorld && net.worldResetNotice
            ? ""
            : "Dostęp wygasł lub świat został zmieniony. Odblokuj ustawienia ponownie.",
        );
    };
    sync();
    const unsubscribe = net.subscribe(sync);
    return () => {
      generation.current++;
      auth.current = null;
      busy.current = null;
      unsubscribe();
    };
  }, [net, lock]);

  useEffect(() => {
    if (!authorization) return;
    const timer = window.setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time >= authorization.expiresAt && busy.current !== "reset")
        lock("Dostęp wygasł po 90 sekundach. Odblokuj ustawienia ponownie.");
    }, 250);
    return () => window.clearInterval(timer);
  }, [authorization, lock]);

  useEffect(() => {
    if (confirmation) cancelButton.current?.focus();
  }, [confirmation]);

  const unlock = async (event: FormEvent) => {
    event.preventDefault();
    if (busy.current || !net.connected || net.closed || !password) return;
    const attempt = ++generation.current;
    busy.current = "unlock";
    setPending("unlock");
    setError("");
    setNotice("");
    const secret = password;
    setPassword("");
    try {
      const result = await net.unlockWorld(secret);
      if (attempt !== generation.current) return;
      const time = Date.now();
      if (!result.ok) {
        lock(result.message || "Nie udało się odblokować ustawień świata.");
        return;
      }
      if (
        !net.connected ||
        net.closed ||
        result.worldId !== net.worldId ||
        !Number.isInteger(result.seed) ||
        Number(result.seed) < -2147483648 ||
        Number(result.seed) > 2147483647 ||
        !Number.isFinite(result.expiresAt) ||
        Number(result.expiresAt) <= time
      ) {
        lock("Dostęp wygasł lub odpowiedź serwera jest nieaktualna. Spróbuj ponownie.");
        return;
      }
      const next = {
        seed: result.seed!,
        worldId: result.worldId!,
        expiresAt: Math.min(result.expiresAt!, time + 90000),
      };
      auth.current = next;
      setAuthorization(next);
      setNow(time);
      setChoice("random");
      setSeedText("");
    } catch {
      if (attempt === generation.current)
        lock("Nie udało się połączyć z serwerem. Spróbuj ponownie.");
    } finally {
      if (attempt === generation.current) {
        busy.current = null;
        setPending(null);
      }
    }
  };

  const prepare = () => {
    const current = auth.current;
    if (busy.current || !current) return;
    if (
      !net.connected ||
      net.closed ||
      current.worldId !== net.worldId ||
      Date.now() >= current.expiresAt
    ) {
      lock("Dostęp wygasł. Odblokuj ustawienia ponownie.");
      return;
    }
    const seed = choice === "random" ? null : parseWorldSeed(seedText);
    if (choice === "custom" && seed === null) {
      setError(
        "Podaj liczbę całkowitą od −2147483648 do 2147483647. Zero i liczby ujemne są dozwolone.",
      );
      return;
    }
    setError("");
    setConfirmation({ seed, worldId: current.worldId });
  };

  const reset = async () => {
    const current = auth.current,
      target = confirmation;
    if (busy.current || !current || !target) return;
    if (
      !net.connected ||
      net.closed ||
      current.worldId !== net.worldId ||
      target.worldId !== current.worldId ||
      Date.now() >= current.expiresAt ||
      (target.seed !== null && parseWorldSeed(String(target.seed)) === null)
    ) {
      lock("Dostęp wygasł lub świat został zmieniony. Odblokuj ustawienia ponownie.");
      return;
    }
    const attempt = ++generation.current;
    busy.current = "reset";
    setPending("reset");
    setError("");
    try {
      const result = await net.resetWorld(target.seed, target.worldId);
      if (attempt !== generation.current) return;
      lock(result.ok ? "" : result.message || "Nie udało się zresetować świata.");
      if (result.ok)
        setNotice(
          result.message || `Świat został zresetowany. Nowy seed: ${result.seed ?? "losowy"}.`,
        );
    } catch {
      if (attempt === generation.current)
        lock("Nie otrzymano potwierdzenia resetu. Sprawdź połączenie z serwerem.");
    }
  };

  const seconds = authorization
    ? Math.max(0, Math.ceil((authorization.expiresAt - now) / 1000))
    : 0;
  return (
    <section className="world-admin" aria-labelledby={id + "-title"}>
      <header className="world-admin-heading">
        <div className="world-admin-symbol">
          <RotateCcw size={21} />
        </div>
        <div>
          <span>Administracja serwerem</span>
          <h3 id={id + "-title"}>Reset wspólnego świata</h3>
        </div>
        <span className={"world-admin-lock " + (authorization ? "unlocked" : "")}>
          {authorization ? <UnlockKeyhole size={14} /> : <LockKeyhole size={14} />}
          {authorization ? `${seconds} s` : "Zablokowane"}
        </span>
      </header>
      <p className="world-admin-intro">
        Rozpocznij wspólną przygodę od nowa. Dostęp wymaga hasła administratora.
      </p>
      {!connected && (
        <p className="world-admin-note">Połącz się ze wspólnym światem, aby zarządzać serwerem.</p>
      )}
      {notice && (
        <p className="world-admin-notice" role="status">
          <Check size={17} />
          {notice}
        </p>
      )}
      {!authorization ? (
        <form className="world-admin-unlock" onSubmit={unlock}>
          <label htmlFor={id + "-password"}>Hasło administratora</label>
          <div>
            <input
              id={id + "-password"}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={128}
              disabled={!connected || !!pending}
              required
              aria-describedby={id + "-privacy"}
            />
            <button type="submit" disabled={!connected || !!pending || !password}>
              <LockKeyhole size={16} />
              {pending === "unlock" ? "Odblokowywanie…" : "Odblokuj"}
            </button>
          </div>
          <small id={id + "-privacy"}>
            Hasło nie jest zapisywane. Dostęp wygasa po 90 sekundach lub po rozłączeniu.
          </small>
        </form>
      ) : (
        <>
          <div className="world-admin-current">
            <span>Aktualny seed</span>
            <output>{authorization.seed}</output>
          </div>
          <fieldset className="world-admin-seeds" disabled={!!pending || !!confirmation}>
            <legend>Seed nowego świata</legend>
            <div className="world-admin-seed-options">
              <label className={choice === "random" ? "selected" : ""}>
                <input
                  type="radio"
                  name={id + "-seed-choice"}
                  value="random"
                  checked={choice === "random"}
                  onChange={() => {
                    setChoice("random");
                    setError("");
                  }}
                />
                <span>
                  <b>Losowy seed</b>
                  <small>Zupełnie nowy krajobraz.</small>
                </span>
              </label>
              <label className={choice === "custom" ? "selected" : ""}>
                <input
                  type="radio"
                  name={id + "-seed-choice"}
                  value="custom"
                  checked={choice === "custom"}
                  onChange={() => {
                    setChoice("custom");
                    setError("");
                  }}
                />
                <span>
                  <b>Własny seed</b>
                  <small>Wpisz wybraną liczbę.</small>
                </span>
              </label>
            </div>
            {choice === "custom" && (
              <div className="world-admin-custom">
                <label htmlFor={id + "-seed"}>Własny seed</label>
                <div>
                  <input
                    id={id + "-seed"}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={seedText}
                    onChange={(event) => {
                      setSeedText(event.target.value);
                      setError("");
                    }}
                    placeholder="np. 0 lub −1234567"
                    maxLength={12}
                    aria-describedby={id + "-seed-range"}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setSeedText((value) => (value.startsWith("-") ? value.slice(1) : "-" + value))
                    }
                    aria-label="Zmień znak seeda"
                  >
                    ±
                  </button>
                </div>
                <small id={id + "-seed-range"}>Od −2147483648 do 2147483647.</small>
              </div>
            )}
          </fieldset>
          {!confirmation ? (
            <button
              type="button"
              className="world-admin-prepare"
              disabled={!!pending || !connected}
              onClick={prepare}
            >
              Przygotuj reset <ArrowRight size={16} />
            </button>
          ) : (
            <div
              className="world-admin-confirm"
              role="alertdialog"
              aria-labelledby={id + "-confirm-title"}
              aria-describedby={id + "-consequences"}
            >
              <h4 id={id + "-confirm-title"}>
                <ShieldAlert size={19} />
                Potwierdź reset świata
              </h4>
              <p className="world-admin-target">
                Nowy seed: <b>{confirmation.seed === null ? "losowy" : confirmation.seed}</b>
              </p>
              <p id={id + "-consequences"}>
                Zastąpi wspólny świat dla wszystkich. Budowle, skrzynie i postęp graczy zostaną
                usunięte. Bez kopii poprzedniej wersji.
              </p>
              <div className="world-admin-confirm-actions">
                <button
                  ref={cancelButton}
                  type="button"
                  disabled={!!pending}
                  onClick={() => setConfirmation(null)}
                >
                  Wróć
                </button>
                <button
                  type="button"
                  className="world-admin-reset"
                  disabled={!!pending || !connected}
                  onClick={() => void reset()}
                >
                  <RotateCcw size={16} />
                  {pending === "reset" ? "Resetowanie…" : "Zresetuj świat"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {error && (
        <p className="world-admin-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
