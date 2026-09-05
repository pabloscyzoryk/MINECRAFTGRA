"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Mic, MicOff, Headphones, Keyboard, RefreshCw, Volume2 } from "lucide-react";
import type { VoiceChat, VoiceMode } from "@/lib/voice";
import { keyName } from "@/lib/settings";

const styles = `.voice-settings{display:grid;gap:18px;color:#e1ebd6}.voice-settings-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.voice-settings-head h3{display:flex;align-items:center;gap:8px;font-size:16px;margin:0}.voice-settings small,.voice-settings-note{color:#aebfae;font-size:12px;line-height:1.6}.voice-settings button{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:38px;padding:8px 12px;border:1px solid #bed69a55;border-radius:7px;background:#283c30;color:#e5efcd;cursor:pointer;font-size:12px}.voice-settings button:disabled{opacity:.5;cursor:default}.voice-settings button:focus-visible,.voice-settings input:focus-visible,.voice-settings select:focus-visible{outline:2px solid #d9edb6;outline-offset:3px}.voice-settings .voice-start{background:#c8dda0;color:#19251c;font-weight:600}.voice-settings-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px}.voice-settings-field{display:flex;flex-direction:column;gap:7px;font-size:13px;min-width:0}.voice-settings-field>span{display:flex;align-items:center;justify-content:space-between;gap:8px}.voice-settings-field output{font:12px Consolas,monospace;color:#d4e6b9}.voice-settings select{width:100%;min-height:39px;background:#172c24;color:#e7f0dc;border:1px solid #aec19b50;border-radius:7px;padding:8px}.voice-settings input[type=range]{width:100%;accent-color:#c8dda0}.voice-device-row{display:flex;gap:8px}.voice-device-row select{flex:1;min-width:0}.voice-settings-test{padding:15px;border:1px solid #aabe9860;border-radius:10px;background:#132a2070;display:grid;gap:12px}.voice-meter-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:13px}.voice-meter{height:14px;border:1px solid #aec29940;border-radius:5px;background:#0d1c17;position:relative;overflow:hidden}.voice-meter-fill{height:100%;background:linear-gradient(90deg,#79ae72,#d5d16f);transition:width .08s linear}.voice-meter-threshold{position:absolute;top:0;bottom:0;width:2px;background:#f8f4d2}.voice-meter-value{font:12px Consolas,monospace;white-space:nowrap}.voice-check{display:flex;gap:9px;align-items:flex-start;font-size:12px;line-height:1.6}.voice-check input{margin-top:4px;accent-color:#c8dda0}.voice-settings-toggles{display:flex;flex-wrap:wrap;gap:10px 20px}.voice-settings-status{font-size:12px;line-height:1.6;color:#c3d8b6;margin:0}.voice-settings-status.speaking{color:#e1f7bd}.voice-settings-error{margin:0;padding:11px 13px;background:#63342540;border:1px solid #d3916870;border-radius:7px;color:#ffd6b9;font-size:12px;line-height:1.6}.voice-settings-key{align-self:flex-start}.voice-settings-note{margin:0}@media(max-width:520px){.voice-settings-grid{grid-template-columns:1fr}.voice-settings-head{align-items:flex-start;flex-direction:column}.voice-settings-head button{width:100%}.voice-settings-test{padding:12px}.voice-settings button{min-height:42px}.voice-meter-heading{align-items:flex-start}}`;

export default function VoiceSettings({
  voice,
  localOnly = false,
}: {
  voice: VoiceChat;
  localOnly?: boolean;
}) {
  const deviceFieldId = useId();
  const [, redraw] = useState(0);
  const [binding, setBinding] = useState(false),
    [bindingMessage, setBindingMessage] = useState("");
  const ownsTest = useRef(false);
  useEffect(() => voice.subscribe(() => redraw((value) => value + 1)), [voice]);
  useEffect(() => {
    void voice.refreshDevices();
    return () => {
      if (ownsTest.current) voice.stopTest();
      else voice.setMonitor(false);
      ownsTest.current = false;
    };
  }, [voice]);
  useEffect(() => {
    if (!binding) return;
    const capture = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.code === "Escape") {
        setBinding(false);
        return;
      }
      if (
        ["Enter", "KeyT", "Tab", "MetaLeft", "MetaRight", "AltLeft", "AltRight"].includes(
          event.code,
        )
      ) {
        setBindingMessage("Ten klawisz obsługuje czat lub przeglądarkę. Wybierz inny.");
        return;
      }
      voice.set({ key: event.code });
      setBindingMessage(`Rozmowa: ${keyName(event.code)}`);
      setBinding(false);
    };
    window.addEventListener("keydown", capture, true);
    return () => window.removeEventListener("keydown", capture, true);
  }, [binding, voice]);
  const level = Math.round(voice.level * 100);
  const status = voice.requesting
    ? "Oczekiwanie na urządzenie lub zgodę przeglądarki…"
    : voice.capturing && voice.context?.state === "suspended"
      ? "Przeglądarka wstrzymała dźwięk. Kliknij „Uruchom dźwięk”, aby wznowić mikrofon."
      : voice.transmitting
        ? "Mikrofon nadaje do połączonych graczy."
        : voice.enabled && !voice.connected()
          ? "Mikrofon gotowy. Nadawanie zacznie się po połączeniu z serwerem."
          : voice.enabled
            ? voice.threshold > 0 && voice.mode === "always"
              ? "Mikrofon czeka na głos powyżej progu."
              : `Mikrofon gotowy · ${voice.mode === "hold" ? "przytrzymaj" : "naciśnij"} ${keyName(voice.key)}.`
            : voice.testing
              ? "Test lokalny — głos nie jest wysyłany do graczy."
              : "Mikrofon wyłączony.";
  return (
    <section className="voice-settings" aria-label="Ustawienia mikrofonu i rozmowy">
      <style>{styles}</style>
      <div className="voice-settings-head">
        <div>
          <h3>
            <Mic size={18} />
            Mikrofon i rozmowa
          </h3>
          <small>Urządzenie, czułość i sposób aktywacji.</small>
        </div>
        {!localOnly && (
          <button
            className="voice-start"
            onClick={() =>
              voice.enabled || voice.requesting ? voice.disable() : void voice.start()
            }
          >
            {voice.enabled ? <MicOff size={16} /> : <Mic size={16} />}
            {voice.requesting
              ? "Anuluj włączanie"
              : voice.enabled
                ? "Wyłącz mikrofon"
                : "Włącz mikrofon"}
          </button>
        )}
      </div>
      <div className="voice-settings-field">
        <label htmlFor={deviceFieldId}>Urządzenie wejściowe</label>
        <div className="voice-device-row">
          <select
            id={deviceFieldId}
            value={voice.deviceId}
            onChange={(event) => voice.set({ deviceId: event.target.value })}
          >
            <option value="">Domyślny mikrofon</option>
            {voice.deviceId &&
              !voice.devices.some((device) => device.deviceId === voice.deviceId) && (
                <option value={voice.deviceId}>Wybrane urządzenie (oczekiwanie na listę)</option>
              )}
            {voice.devices
              .filter((device) => device.deviceId && device.deviceId !== "default")
              .map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </option>
              ))}
          </select>
          <button
            onClick={() => void voice.refreshDevices()}
            title="Odśwież listę mikrofonów"
            aria-label="Odśwież listę mikrofonów"
          >
            <RefreshCw size={16} />
          </button>
        </div>
        <small>Nazwy urządzeń mogą pojawić się dopiero po udzieleniu dostępu do mikrofonu.</small>
      </div>
      <div className="voice-settings-grid">
        <label className="voice-settings-field">
          <span>
            Głośność mikrofonu <output>{Math.round(voice.inputGain * 100)}%</output>
          </span>
          <input
            aria-label="Głośność mikrofonu"
            type="range"
            min="0"
            max="3"
            step="0.05"
            value={voice.inputGain}
            onChange={(event) => voice.set({ inputGain: Number(event.target.value) })}
          />
        </label>
        <label className="voice-settings-field">
          <span>
            <span>
              <Volume2 size={14} style={{ display: "inline" }} /> Głośność innych graczy
            </span>
            <output>{Math.round(voice.volume * 100)}%</output>
          </span>
          <input
            aria-label="Głośność innych graczy"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={voice.volume}
            onChange={(event) => voice.set({ volume: Number(event.target.value) })}
          />
        </label>
        <label className="voice-settings-field">
          <span>Sposób aktywacji</span>
          <select
            value={voice.mode}
            onChange={(event) => voice.set({ mode: event.target.value as VoiceMode })}
          >
            <option value="always">Zawsze po włączeniu</option>
            <option value="hold">Przytrzymaj klawisz</option>
            <option value="toggle">Naciśnij: włącz / wyłącz</option>
          </select>
        </label>
        <div className="voice-settings-field">
          <span>Klawisz rozmowy</span>
          <button
            className="voice-settings-key"
            disabled={voice.mode === "always"}
            onClick={() => {
              setBinding(true);
              setBindingMessage("");
            }}
          >
            <Keyboard size={16} />
            {binding ? "Naciśnij klawisz… (Esc anuluje)" : keyName(voice.key)}
          </button>
        </div>
        <label className="voice-settings-field">
          <span>
            Próg aktywacji głosem <output>{Math.round(voice.threshold * 100)}%</output>
          </span>
          <input
            aria-label="Próg aktywacji głosem"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={voice.threshold}
            onChange={(event) => voice.set({ threshold: Number(event.target.value) })}
          />
          <small>0% nie odcina ciszy. Wyższy próg pomija ciche dźwięki tła.</small>
        </label>
        <label className="voice-settings-field">
          <span>
            Podtrzymanie po mowie <output>{voice.hangoverMs} ms</output>
          </span>
          <input
            aria-label="Podtrzymanie po mowie"
            type="range"
            min="0"
            max="1500"
            step="50"
            value={voice.hangoverMs}
            onChange={(event) => voice.set({ hangoverMs: Number(event.target.value) })}
          />
          <small>Krótka przerwa zapobiega urywaniu końcówek słów.</small>
        </label>
      </div>
      {bindingMessage && (
        <p className="voice-settings-note" role="status">
          {bindingMessage}
        </p>
      )}
      <div className="voice-settings-test">
        <div className="voice-meter-heading">
          <span>
            Test mikrofonu · <b className="voice-meter-value">{level}%</b>
          </span>
          <button
            onClick={() => {
              if (voice.testing) {
                ownsTest.current = false;
                voice.stopTest();
              } else {
                ownsTest.current = true;
                void voice.startTest();
              }
            }}
          >
            {voice.testing ? "Zakończ test" : "Rozpocznij test"}
          </button>
        </div>
        <div
          className="voice-meter"
          role="meter"
          aria-label="Poziom mikrofonu"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={level}
        >
          <div className="voice-meter-fill" style={{ width: level + "%" }} />
          <i
            className="voice-meter-threshold"
            style={{ left: `min(calc(100% - 2px), ${voice.threshold * 100}%)` }}
          />
        </div>
        <label className="voice-check">
          <input
            type="checkbox"
            checked={voice.monitor}
            disabled={!voice.capturing}
            onChange={(event) => voice.setMonitor(event.target.checked)}
          />
          <span>
            <Headphones size={14} style={{ display: "inline" }} /> Słuchaj własnego mikrofonu
            (odsłuch lokalny)
            <br />
            <small>
              Użyj słuchawek, aby uniknąć sprzężenia. Odsłuch domyślnie jest wyłączony i kończy się
              po zamknięciu ustawień.
            </small>
          </span>
        </label>
        <p
          className={"voice-settings-status " + (voice.transmitting ? "speaking" : "")}
          role="status"
        >
          {status}
        </p>
        {voice.capturing && voice.context?.state === "suspended" && (
          <button
            onClick={() => {
              void voice
                .playback()
                .then(() => redraw((value) => value + 1))
                .catch(() => {
                  voice.error =
                    "Przeglądarka nie pozwoliła wznowić dźwięku. Sprawdź uprawnienia dźwięku tej strony.";
                  redraw((value) => value + 1);
                });
            }}
          >
            Uruchom dźwięk
          </button>
        )}
      </div>
      <div className="voice-settings-field">
        <span>
          Przetwarzanie wejścia <small>jeśli obsługiwane przez urządzenie</small>
        </span>
        <div className="voice-settings-toggles">
          <label className="voice-check">
            <input
              type="checkbox"
              checked={voice.echoCancellation}
              onChange={(event) => voice.set({ echoCancellation: event.target.checked })}
            />
            Usuwanie echa
          </label>
          <label className="voice-check">
            <input
              type="checkbox"
              checked={voice.noiseSuppression}
              onChange={(event) => voice.set({ noiseSuppression: event.target.checked })}
            />
            Redukcja szumu
          </label>
          <label className="voice-check">
            <input
              type="checkbox"
              checked={voice.autoGainControl}
              onChange={(event) => voice.set({ autoGainControl: event.target.checked })}
            />
            Automatyczna czułość
          </label>
        </div>
      </div>
      {voice.error && (
        <p className="voice-settings-error" role="alert">
          {voice.error}
        </p>
      )}
      {localOnly && (
        <p className="voice-settings-note">
          Test działa lokalnie. Wybrane ustawienia będą używane po wejściu do trybu wieloosobowego.
        </p>
      )}
    </section>
  );
}
