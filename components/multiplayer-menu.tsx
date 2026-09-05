"use client";
import { useEffect, useRef, useState } from "react";
import {
  Users,
  Mic,
  MicOff,
  MessageSquare,
  Volume2,
  Wifi,
  Radio,
  Shield,
  Keyboard,
} from "lucide-react";
import type { Game } from "@/lib/engine";
import { Multiplayer } from "@/lib/multiplayer";
import { MAX_PLAYERS, validNick } from "@/lib/net-protocol";
import { keyName } from "@/lib/settings";
import DifficultyPicker from "@/components/difficulty-picker";
import { normalizeDifficulty, type Difficulty } from "@/lib/difficulty";
function useNetwork(net: Multiplayer | null) {
  const [, set] = useState(0);
  useEffect(() => net?.subscribe(() => set((v) => v + 1)), [net]);
}
export default function MultiplayerMenu({ game, onJoined }: { game: Game; onJoined: () => void }) {
  const [nick, setNick] = useState(() => {
      try {
        return localStorage.getItem("blockland.online.nick") ?? "";
      } catch {
        return "";
      }
    }),
    [net, setNet] = useState<Multiplayer | null>(game.net),
    [difficulty, setDifficulty] = useState<Difficulty>(normalizeDifficulty(game.difficulty)),
    [error, setError] = useState("");
  useNetwork(net);
  useEffect(() => {
    if (net?.initialized && net.connected) onJoined();
  }, [net?.initialized, net?.connected, onJoined]);
  const join = () => {
    if (!validNick(nick.trim())) {
      setError("Wpisz 3–20 liter, cyfr, znaków _ lub -.");
      return;
    }
    setError("");
    net?.close();
    const next = new Multiplayer(game, nick.trim(), difficulty);
    game.net = next;
    setNet(next);
    void next.voice.playback();
    void next.connect();
  };
  return (
    <div className="multiplayer-menu">
      <div className="server-card">
        <div className="server-symbol">
          <Users size={32} />
        </div>
        <div>
          <small>PUBLICZNY SERWER</small>
          <h3>Wspólny świat</h3>
          <p>Przetrwanie · 3 wymiary · PvP · {MAX_PLAYERS} miejsc</p>
        </div>
        <span className="server-dot" />
      </div>
      <label className="nickname-label">
        Twój nick
        <input
          value={nick}
          onChange={(e) => setNick(e.target.value)}
          maxLength={20}
          autoComplete="nickname"
          placeholder="Np. Odkrywca"
          onKeyDown={(e) => {
            if (e.key === "Enter") join();
          }}
        />
      </label>
      <DifficultyPicker value={difficulty} onChange={setDifficulty} online />
      <p className="panel-footnote">
        Dołączacie do tego samego świata pod tym samym adresem strony. Nowa postać zaczyna z pustym
        ekwipunkiem. Środek doliny jest strefą bezpieczną; poza nią działa PvP.
      </p>
      {(error || net?.status) && (
        <p className="connection-status" role="status">
          {error || net?.status}
        </p>
      )}
      <button
        className="primary-action"
        onClick={join}
        disabled={!!net && !net.fatal && !net.closed && !net.connected}
      >
        <Users size={19} />
        {net && !net.fatal && !net.closed ? "Łączenie…" : "Dołącz do świata"}
      </button>
      {net && !net.connected && (
        <button
          className="quiet-action"
          onClick={() => {
            net.close();
            game.net = null;
            setNet(null);
          }}
        >
          Anuluj połączenie
        </button>
      )}
      <div className="online-rules">
        <span>
          <MessageSquare size={16} /> Enter / T — czat
        </span>
        <span>
          <Mic size={16} /> V — rozmowa
        </span>
        <span>
          <Shield size={16} /> PPM z tarczą — blok
        </span>
      </div>
    </div>
  );
}
export function NetworkHUD({ game, open }: { game: Game; open: (p: string) => void }) {
  const net = game.net!;
  useNetwork(net);
  const [voiceSettings, setVoiceSettings] = useState(false),
    [binding, setBinding] = useState(false);
  const voice = net.voice;
  useEffect(() => {
    if (!binding) return;
    const key = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!["Escape", "Enter", "KeyT"].includes(e.code)) voice.set({ key: e.code });
      setBinding(false);
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [binding, voice]);
  if (!net.initialized) return null;
  return (
    <>
      <div className="network-hud">
        <button onClick={() => setVoiceSettings((v) => !v)} title="Gracze i rozmowa">
          <Wifi size={15} />
          <b>{net.connected ? net.players.length + " online" : "Ponawianie…"}</b>
          <small>{net.ping} ms</small>
        </button>
        <button onClick={() => open("chat")} title="Czat [Enter / T]">
          <MessageSquare size={19} />
        </button>
        <button
          className={voice.transmitting ? "speaking" : ""}
          onClick={() => void voice.enable()}
          title={voice.enabled ? "Wyłącz mikrofon" : "Włącz mikrofon"}
        >
          {voice.enabled ? <Mic size={19} /> : <MicOff size={19} />}
        </button>
      </div>
      {voice.enabled && (
        <button
          className={"voice-touch " + (voice.transmitting ? "speaking" : "")}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            if (voice.mode === "hold") voice.pressed = true;
            else if (voice.mode === "toggle") voice.latched = !voice.latched;
            net.emit();
          }}
          onPointerUp={() => {
            voice.pressed = false;
            net.emit();
          }}
          onPointerCancel={() => {
            voice.pressed = false;
            net.emit();
          }}
        >
          <Mic size={22} />
          <span>
            {voice.mode === "hold"
              ? "Trzymaj i mów"
              : voice.mode === "toggle"
                ? "Rozmowa"
                : "Mikrofon"}
          </span>
        </button>
      )}
      <div className="combat-hud">
        <span>
          <Shield size={13} />
          {net.protection > 0
            ? "Ochrona po odrodzeniu"
            : game.world.dimension === "overworld" &&
                Math.hypot(game.position.x - 8, game.position.z - 22) < 12
              ? "Strefa bezpieczna"
              : "PvP aktywne"}
        </span>
        <div title="Wytrzymałość">
          <i style={{ width: net.stamina + "%" }} />
        </div>
      </div>
      {!net.connected && (
        <div className="connection-banner" role="status">
          {net.status} Działania wrócą po połączeniu.
        </div>
      )}
      {net.chat.length > 0 && (
        <div className="chat-preview" onClick={() => open("chat")}>
          {net.chat.slice(-4).map((m, i) => (
            <p key={i}>
              <b>{m.nick}: </b>
              {m.text}
            </p>
          ))}
        </div>
      )}
      {voiceSettings && (
        <section className="voice-popover">
          <header>
            <b>Gracze i rozmowa</b>
            <button onClick={() => setVoiceSettings(false)} aria-label="Zamknij">
              ×
            </button>
          </header>
          <div className="player-list">
            {net.players.map((p) => (
              <div key={p.id}>
                <i
                  className={
                    (
                      p.id === net.id
                        ? voice.transmitting
                        : (voice.remote.get(p.id)?.until ?? 0) > performance.now()
                    )
                      ? "speaking"
                      : ""
                  }
                />
                <span>
                  {p.nick}
                  {p.id === net.id ? " (Ty)" : ""}
                </span>
              </div>
            ))}
          </div>
          <button className="primary-action" onClick={() => void voice.enable()}>
            {voice.enabled ? <MicOff size={17} /> : <Mic size={17} />}{" "}
            {voice.enabled ? "Wyłącz mikrofon" : "Włącz mikrofon"}
          </button>
          <label>
            Aktywacja mikrofonu
            <select
              value={voice.mode}
              onChange={(e) => voice.set({ mode: e.target.value as "hold" | "toggle" | "always" })}
            >
              <option value="hold">Trzymanie przycisku</option>
              <option value="toggle">Kliknięcie włącza / wyłącza</option>
              <option value="always">Zawsze włączony</option>
            </select>
          </label>
          {voice.mode !== "always" && (
            <button className="binding-button" onClick={() => setBinding(true)}>
              <Keyboard size={16} />
              {binding ? "Naciśnij wybrany klawisz…" : `Klawisz: ${keyName(voice.key)}`}
            </button>
          )}
          <label>
            <Volume2 size={15} /> Głośność rozmów{" "}
            <input
              type="range"
              min="0"
              max="1"
              step=".05"
              value={voice.volume}
              onChange={(e) => voice.set({ volume: Number(e.target.value) })}
            />
          </label>
          <p className="mic-state">
            <Radio size={15} />
            {voice.enabled
              ? voice.transmitting
                ? "Nadajesz"
                : `Gotowy • ${keyName(voice.key)}`
              : "Mikrofon wyłączony"}
          </p>
          {voice.error && (
            <p role="alert" className="error-note">
              {voice.error}
            </p>
          )}
          <small>Mikrofon wymaga zgody przeglądarki. Rozmowę słyszą połączeni gracze.</small>
        </section>
      )}
    </>
  );
}
export function ChatPanel({ net, close }: { net: Multiplayer; close: () => void }) {
  useNetwork(net);
  const [message, setMessage] = useState(""),
    input = useRef<HTMLInputElement>(null),
    list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);
  useEffect(() => {
    list.current?.scrollTo(0, list.current.scrollHeight);
  }, [net.chat.length]);
  const send = () => {
    net.sendChat(message);
    setMessage("");
    input.current?.focus();
  };
  return (
    <div className="chat-panel">
      <div ref={list} className="chat-log" role="log" aria-live="polite">
        {net.chat.length === 0 ? (
          <p>Napisz pierwszą wiadomość do innych graczy.</p>
        ) : (
          net.chat.map((m, i) => (
            <p key={i} className={m.system ? "system-message" : ""}>
              <time>
                {new Date(m.time).toLocaleTimeString("pl", { hour: "2-digit", minute: "2-digit" })}
              </time>{" "}
              <b>{m.nick}</b>
              <span>{m.text}</span>
            </p>
          ))
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          ref={input}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={240}
          placeholder="Napisz wiadomość…"
          aria-label="Wiadomość"
          enterKeyHint="send"
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") {
              e.preventDefault();
              close();
            }
          }}
        />
        <button type="submit">Wyślij</button>
      </form>
      <small>Enter — wyślij · Escape — wróć do gry</small>
    </div>
  );
}
