"use client";
import { useEffect, useRef, useState } from "react";
import { Users, Mic, MicOff, MessageSquare, Wifi, Shield, Video, VideoOff } from "lucide-react";
import type { Game } from "@/lib/engine";
import { Multiplayer } from "@/lib/multiplayer";
import { MAX_PLAYERS, validNick } from "@/lib/net-protocol";
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
  const joining = useRef<Multiplayer | null>(null);
  const [, voiceRefresh] = useState(0);
  useEffect(() => {
    const unsubscribe = game.voice.subscribe(() => voiceRefresh((value) => value + 1));
    void game.voice.start();
    return () => {
      unsubscribe();
      const owned = joining.current;
      if (owned && !owned.connected) {
        owned.close();
        if (game.net === owned) game.net = null;
      }
      if (!game.net) game.voice.disable();
    };
  }, [game]);
  useEffect(() => {
    if (net?.initialized && net.connected) onJoined();
  }, [net?.initialized, net?.connected, onJoined]);
  const join = () => {
    if (!validNick(nick.trim())) {
      setError("Wpisz 3–20 liter, cyfr, znaków _ lub -.");
      return;
    }
    setError("");
    const keepMicrophone = game.voice.enabled || game.voice.requesting;
    net?.close();
    if (net && keepMicrophone) void game.voice.start();
    const next = new Multiplayer(game, nick.trim(), difficulty);
    joining.current = next;
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
      <div className="menu-microphone">
        <button
          className={game.voice.enabled ? "speaking" : ""}
          onClick={() => (game.voice.requesting ? game.voice.disable() : void game.voice.enable())}
          aria-label={
            game.voice.enabled || game.voice.requesting ? "Wyłącz mikrofon" : "Włącz mikrofon"
          }
        >
          {game.voice.enabled ? <Mic size={20} /> : <MicOff size={20} />}
        </button>
        <div>
          <b>
            {game.voice.requesting
              ? "Zezwól na mikrofon w przeglądarce"
              : game.voice.enabled
                ? "Mikrofon gotowy"
                : "Mikrofon wyłączony"}
          </b>
          <p>
            Domyślnie działa cały czas. Rozmowa zacznie się po dołączeniu. Urządzenie i tryb
            zmienisz w ustawieniach.
          </p>
        </div>
      </div>
      {game.voice.error && (
        <p className="error-note" role="alert">
          {game.voice.error} Możesz grać bez mikrofonu.
        </p>
      )}
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
          <Mic size={16} /> Rozmowa głosowa
        </span>
        <span>
          <Shield size={16} /> PPM z tarczą — blok
        </span>
      </div>
    </div>
  );
}
export function NetworkToolbar({ game, open }: { game: Game; open: (p: string) => void }) {
  const net = game.net;
  useNetwork(net);
  const voice = game.voice;
  const [, refresh] = useState(0);
  useEffect(() => voice.subscribe(() => refresh((value) => value + 1)), [voice]);
  useEffect(() => game.faceCamera.subscribe(() => refresh((value) => value + 1)), [game]);
  return (
    <div className="network-hud">
      {net?.initialized && (
        <>
          <button
            onClick={() => open("media")}
            title="Gracze i ustawienia rozmowy"
            className="network-status"
          >
            <Wifi size={15} />
            <b>{net.connected ? net.players.length + " online" : "Ponawianie…"}</b>
            <small>{net.ping} ms</small>
          </button>
          <button onClick={() => open("chat")} title="Czat [Enter / T]" aria-label="Czat">
            <MessageSquare size={18} />
          </button>
          <button
            className={voice.transmitting ? "speaking" : ""}
            onClick={() => (voice.requesting ? voice.disable() : void voice.enable())}
            title={voice.enabled || voice.requesting ? "Wyłącz mikrofon" : "Włącz mikrofon"}
            aria-label={voice.enabled || voice.requesting ? "Wyłącz mikrofon" : "Włącz mikrofon"}
          >
            {voice.enabled ? <Mic size={18} /> : <MicOff size={18} />}
          </button>
        </>
      )}
      <button
        className={game.faceCamera.enabled ? "camera-on" : ""}
        onClick={() => open("media")}
        title="Mikrofon i kamera"
        aria-label="Ustawienia mikrofonu i kamerki"
      >
        {game.faceCamera.enabled ? <Video size={18} /> : <VideoOff size={18} />}
        {game.faceCamera.enabled && <span className="camera-live-dot" />}
      </button>
    </div>
  );
}
export function NetworkPlayers({ game }: { game: Game }) {
  const net = game.net;
  useNetwork(net);
  if (!net) return null;
  return (
    <section className="media-card network-players">
      <h3>
        <Users size={19} /> Gracze online · {net.players.length}
      </h3>
      <div className="player-list">
        {net.players.map((player) => (
          <div key={player.id}>
            <i
              className={
                (
                  player.id === net.id
                    ? net.voice.transmitting
                    : (net.voice.remote.get(player.id)?.until ?? 0) > performance.now()
                )
                  ? "speaking"
                  : ""
              }
            />
            <span>
              {player.nick}
              {player.id === net.id ? " (Ty)" : ""}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
export function NetworkHUD({ game, open }: { game: Game; open: (p: string) => void }) {
  const net = game.net!;
  useNetwork(net);
  const voice = net.voice;
  if (!net.initialized) return null;
  return (
    <>
      {voice.enabled && voice.mode !== "always" && (
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
