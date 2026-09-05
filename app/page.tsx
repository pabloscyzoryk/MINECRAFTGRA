"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import "./landing.css";
import "./bed.css";
import "./pause.css";
import PauseDetails from "@/components/pause-details";
import BedStatus from "@/components/bed-status";
import GameLanding from "@/components/game-landing";
import { DRAGON_MAX_HEALTH, DRAGON_ENRAGED_HEALTH } from "@/lib/dragon-balance";
import {
  ArrowUpRight,
  ArrowRight,
  Box,
  Mountain,
  Play,
  Settings2,
  Sun,
  Moon,
  Heart,
  Drumstick,
  Backpack,
  Compass,
  Maximize,
  Pickaxe,
  X,
  Download,
  Upload,
  Flame,
  Sparkles,
  BookOpen,
  Home as HomeIcon,
  RotateCcw,
  ArrowDown,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { DIMENSIONS, item, type Mode, type Dimension } from "@/lib/blocks";
import type { Game, Snapshot, GameSettings } from "@/lib/engine";
import SlotInventory from "@/components/slot-inventory";
import { ItemIcon } from "@/lib/item-art";
import MultiplayerMenu, {
  NetworkHUD,
  NetworkToolbar,
  ChatPanel,
} from "@/components/multiplayer-menu";
import SkinEditor from "@/components/skin-editor";
import GameSettingsPanel from "@/components/game-settings";
import HorrorStatus from "@/components/horror-status";
import { Journal } from "@/components/adventure-panels";
import ChestPanel from "@/components/chest-inventory";
import FurnaceInventory from "@/components/furnace-inventory";
import TouchControls from "@/components/touch-controls";
import { DEFAULT_SETTINGS, keyName } from "@/lib/settings";
import DifficultyPicker, { DIFFICULTY_NAMES } from "@/components/difficulty-picker";
import type { Difficulty } from "@/lib/difficulty";
function MiniMap({ game, snap }: { game: Game | null; snap: Snapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!game || !ref.current) return;
    const ctx = ref.current.getContext("2d")!;
    for (let x = 0; x < 35; x++)
      for (let z = 0; z < 35; z++) {
        const wx = snap.x + (x - 17) * 2,
          wz = snap.z + (z - 17) * 2,
          h = game.world.height(wx, wz);
        ctx.fillStyle =
          snap.dimension === "nether"
            ? h < 13
              ? "#c66939"
              : "#794a44"
            : snap.dimension === "end"
              ? h < 3
                ? "#262435"
                : "#aea77b"
              : h < 13
                ? "#72b4b8"
                : game.world.biomeInfo(wx, wz).color;
        ctx.fillRect(x * 4, z * 4, 4, 4);
      }
    ctx.strokeStyle = "#ffffff15";
    ctx.strokeRect(1, 1, 138, 138);
    ctx.save();
    ctx.translate(70, 70);
    ctx.rotate(-game.yaw);
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fillStyle = "#fff8d6";
    ctx.shadowColor = "#0d3128";
    ctx.shadowBlur = 5;
    ctx.fill();
    ctx.restore();
  }, [game, snap.x, snap.z, snap.dimension, snap.active]);
  return <canvas ref={ref} width={140} height={140} aria-label="Mapa pobliskiego terenu" />;
}
const defaults: GameSettings = DEFAULT_SETTINGS;
const title: Record<string, string> = {
  multiplayer: "Grajmy razem",
  chat: "Czat wspólnego świata",
  journal: "Tam, gdzie jeszcze Cię nie było.",
  chest: "Małe i wielkie znaleziska",
  furnace: "Przy ogniu pieca",
  pause: "Chwila oddechu",
  inventory: "Ekwipunek",
  crafting: "Stół rzemieślniczy",
  settings: "Po Twojemu",
  media: "Mikrofon i kamera",
  dimensions: "Trzy wymiary. Jeden świat.",
  help: "Gotowy na przygodę?",
  death: "To jeszcze nie koniec",
  world: "Nowa przygoda",
  skin: "Twój styl. Każdy piksel.",
};
export default function Home() {
  const mount = useRef<HTMLDivElement>(null),
    game = useRef<Game | null>(null),
    importInput = useRef<HTMLInputElement>(null);
  const menuScroll = useRef<HTMLDivElement>(null),
    menuHero = useRef<HTMLDivElement>(null),
    menuTrigger = useRef<HTMLElement | null>(null),
    menuScrollPosition = useRef(0);
  const [heroVisible, setHeroVisible] = useState(true);
  const [menuSkin, setMenuSkin] = useState(true);
  const [runtime, setRuntime] = useState<Game | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [panel, setPanel] = useState(""),
    [mode, setMode] = useState<Mode>("survival"),
    [difficulty, setDifficulty] = useState<Difficulty>("normal"),
    [settings, setSettings] = useState(defaults),
    [seed, setSeed] = useState("24680"),
    [confirmNew, setConfirmNew] = useState(false);
  useEffect(() => {
    let stop = false;
    import("@/lib/engine")
      .then(({ Game }) => {
        if (stop || !mount.current) return;
        try {
          game.current = new Game(mount.current, setSnap, setPanel);
          setRuntime(game.current);
          setSettings({ ...game.current.settings });
          setReady(true);
        } catch (e) {
          console.error(e);
          setError("Grafika 3D nie jest dostępna. Włącz akcelerację sprzętową i odśwież stronę.");
        }
      })
      .catch(() => setError("Nie udało się wczytać gry. Odśwież stronę."));
    return () => {
      stop = true;
      game.current?.dispose();
      game.current = null;
    };
  }, []);
  const start = useCallback(
    (resume = false) => {
      setPanel("");
      runtime?.start(mode, resume, Number(seed) || 24680, difficulty);
    },
    [runtime, mode, seed, difficulty],
  );
  const open = useCallback(
    (p: string) => {
      if (!snap?.started && document.activeElement instanceof HTMLElement)
        menuTrigger.current = document.activeElement;
      if (snap?.started) runtime?.pause(p);
      else setPanel(p);
    },
    [runtime, snap?.started],
  );
  const close = () => {
    setPanel("");
    if (snap?.started && snap.health > 0) runtime?.resume();
    else if (menuTrigger.current?.isConnected) menuTrigger.current.focus({ preventScroll: true });
  };
  const landingPlay = useCallback(() => start(!!snap?.saved), [start, snap?.saved]);
  const landingMultiplayer = useCallback(() => open("multiplayer"), [open]);
  const landingSettings = useCallback(() => open("settings"), [open]);
  const landingWorld = useCallback(() => open("world"), [open]);
  const landingSkin = useCallback(() => {
    setMenuSkin(true);
    menuScroll.current?.scrollTo({
      top: 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }, []);
  useEffect(() => {
    if (snap?.started || !runtime || !menuHero.current || !menuScroll.current) return;
    menuScroll.current.scrollTop = menuScrollPosition.current;
    if (!window.IntersectionObserver) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = entry.isIntersecting && entry.intersectionRatio > 0;
        runtime.previewVisible = visible;
        setHeroVisible(visible);
      },
      { root: menuScroll.current, threshold: [0, 0.001] },
    );
    observer.observe(menuHero.current);
    return () => {
      observer.disconnect();
      runtime.previewVisible = true;
    };
  }, [runtime, snap?.started]);
  const changeSettings = (v: Partial<GameSettings>) => {
    const next = { ...settings, ...v };
    setSettings(next);
    runtime?.applySettings(next);
  };
  const newWorld = () => {
    if (snap?.saved) {
      setPanel("");
      setConfirmNew(true);
    } else start(false);
  };
  const fullscreen = () => {
    if (!document.fullscreenElement)
      void document.documentElement
        .requestFullscreen()
        .catch(() => runtime?.notify("Pełny ekran jest niedostępny w tym widoku."));
    else void document.exitFullscreen();
  };
  const localCaught =
    snap?.difficulty === "horror" &&
    snap.horrorThreat?.phase === "caught" &&
    snap.horrorThreat.targetId === (runtime?.net?.id ?? "local");
  return (
    <main
      className={
        "game-root " +
        (!snap?.started && menuSkin ? "with-skin-panel " : "") +
        (localCaught && settings.horrorJumpscares ? "guest-caught" : "")
      }
    >
      <div ref={mount} className="world-canvas" />
      {(snap?.active || localCaught) && snap?.difficulty === "horror" && (
        <div
          className="horror-vignette"
          aria-hidden="true"
          style={{ opacity: snap.horrorOverlay }}
        />
      )}
      {!snap?.started && (
        <div
          className="menu-scroll"
          ref={menuScroll}
          tabIndex={0}
          aria-label="Menu główne i informacje o grze"
          onScroll={(e) => {
            menuScrollPosition.current = e.currentTarget.scrollTop;
          }}
        >
          <div className="menu-hero" ref={menuHero}>
            <div className="cinema-shade" />
            <header className="game-header">
              <div className="brand">
                <Box size={24} />
                <b>BLOCKLAND</b>
                <span>BROWSER EDITION</span>
              </div>
              <span className="version">
                <i />
                Twój świat. Twoje zasady.
              </span>
            </header>
            <section className="start-menu">
              <div className="eyebrow">
                <span /> OTWARTY ŚWIAT • NIESKOŃCZONA PRZYGODA
              </div>
              <h1>
                Wielki świat.
                <br />
                <em>Twój pierwszy blok.</em>
              </h1>
              <p>
                Odkrywaj nieznane. Buduj po swojemu.
                <br />
                Przygoda zaczyna się dokładnie tutaj.
              </p>
              <button
                className="play-button"
                disabled={!ready}
                onClick={() => start(!!snap?.saved)}
              >
                <Play size={21} fill="currentColor" />
                {!ready
                  ? "Tworzenie świata…"
                  : snap?.saved
                    ? "Kontynuuj zapisany świat"
                    : "Wejdź do świata"}
                <ArrowUpRight size={21} />
              </button>
              {error && (
                <p className="error-note" role="alert">
                  {error}
                </p>
              )}
              <button
                className="multiplayer-launch"
                disabled={!ready}
                onClick={() => open("multiplayer")}
              >
                ◎ Tryb wieloosobowy <span>Jeden publiczny świat →</span>
              </button>
              <div className="menu-row">
                <button onClick={() => open("world")}>
                  {mode === "survival" ? <Mountain size={18} /> : <Sparkles size={18} />}{" "}
                  {snap?.saved ? "Nowy świat" : "Tryb i trudność"}
                </button>
                <button onClick={() => open("settings")}>
                  <Settings2 size={18} />
                  Ustawienia
                </button>
                <button
                  className="help-small"
                  title="Jak grać"
                  aria-label="Jak grać"
                  onClick={() => open("help")}
                >
                  <BookOpen size={18} />
                </button>
              </div>
              <button className="skin-menu-button" onClick={() => setMenuSkin((v) => !v)}>
                <Box size={17} />
                Skórka i peleryna
                <ArrowRight size={15} />
              </button>
              <div className="world-note">
                <span className="seed-mark">✦</span>
                <div>
                  <b>{snap?.saved ? "Twoja przygoda czeka" : "Zielona dolina"}</b>
                  <small>
                    {snap?.saved
                      ? "Zapis lokalny · Gotowy do kontynuacji"
                      : `Nowy świat · ${DIFFICULTY_NAMES[difficulty]} · Ziarno ${seed}`}
                  </small>
                </div>
              </div>
            </section>
            {menuSkin && (
              <section className="menu-skin-panel" aria-label="Edytor skórki i peleryny">
                <header>
                  <div>
                    <span>TWÓJ ODKRYWCA</span>
                    <h2>Skórka i peleryna</h2>
                  </div>
                  <button
                    onClick={() => setMenuSkin(false)}
                    aria-label="Zamknij edytor skórki"
                    title="Schowaj do przycisku w menu"
                  >
                    <X size={17} />
                  </button>
                </header>
                <SkinEditor presentationActive={heroVisible} />
              </section>
            )}
            <div className="scene-caption">
              <span>01 / 03</span>
              <b>Nadziemie</b>
              <p>Każdy horyzont to nowy początek.</p>
            </div>
            <footer className="menu-footer">
              <span>STWÓRZ COŚ, CO ZOSTANIE.</span>
              <span>
                WASD · Ruch <i /> Mysz · Rozglądanie <i /> E · Ekwipunek
              </span>
            </footer>
            <button
              className="lp-scroll-cue"
              aria-label="Przewiń i poznaj możliwości gry"
              onClick={() =>
                document.getElementById("poznaj-blockland")?.scrollIntoView({
                  behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
                    ? "instant"
                    : "smooth",
                })
              }
            >
              <span>POZNAJ ŚWIAT</span>
              <ArrowDown size={13} />
            </button>
          </div>
          <GameLanding
            ready={ready}
            saved={!!snap?.saved}
            scroller={menuScroll}
            onPlay={landingPlay}
            onMultiplayer={landingMultiplayer}
            onSkin={landingSkin}
            onSettings={landingSettings}
            onWorld={landingWorld}
          />
        </div>
      )}
      {runtime?.net && <NetworkHUD game={runtime} open={open} />}
      {snap?.needsCapture && !panel && !localCaught && (
        <button className="capture-overlay" onClick={() => runtime?.capturePointer()}>
          <span>Wróć do sterowania</span>
          <small>Kliknij, aby przejąć kursor i rozglądać się myszą</small>
        </button>
      )}
      {snap?.started && (
        <>
          <div className="game-vignette" />
          <div className="damage-layer" style={{ opacity: snap.damage * 0.9 }} />
          <div className="water-layer" style={{ opacity: snap.underwater ? 0.4 : 0 }} />
          <header className="hud-header">
            {runtime && <NetworkToolbar game={runtime} open={open} />}
            <div className="hud-actions">
              <button
                title="Atlas i osiągnięcia"
                aria-label="Atlas i osiągnięcia"
                onClick={() => open("journal")}
              >
                <BookOpen size={19} />
              </button>
              <button
                title="Ekwipunek [E]"
                aria-label="Ekwipunek"
                onClick={() => open("inventory")}
              >
                <Backpack size={19} />
              </button>
              <button
                title="Wymiary [M]"
                aria-label="Mapa wymiarów"
                onClick={() => open("dimensions")}
              >
                <Compass size={19} />
              </button>
              <button title="Pełny ekran" aria-label="Pełny ekran" onClick={fullscreen}>
                <Maximize size={18} />
              </button>
              <button title="Pauza [Esc]" aria-label="Pauza" onClick={() => open("pause")}>
                <Settings2 size={19} />
              </button>
            </div>
          </header>
          <div className="hud-left-stack">
            {snap.difficulty === "horror" && snap.horrorThreat && (
              <HorrorStatus threat={snap.horrorThreat} localId={runtime?.net?.id ?? "local"} />
            )}
          </div>
          {snap.adventure.waypoint && snap.dimension === "overworld" && (
            <div className="waypoint-hud">
              <span
                style={{
                  transform: "rotate(" + snap.adventure.waypoint.angle + "deg)",
                }}
              >
                ↑
              </span>
              <div>
                <b>{snap.adventure.waypoint.name}</b>
                <small>{snap.adventure.waypoint.distance} m · cel wyprawy</small>
              </div>
            </div>
          )}
          {settings.minimap && (
            <aside className="map-card">
              <div className="map-circle">
                <MiniMap game={runtime} snap={snap} />
                <span>N</span>
              </div>
              <b>{snap.biome}</b>
              <span className="coords">
                {snap.x} / {snap.y} / {snap.z}
              </span>
              <small>
                {snap.night ? <Moon size={12} /> : <Sun size={12} />} Dzień {snap.day}
                <i />
                {settings.showFPS
                  ? `${snap.fps} FPS`
                  : {
                      clear: "Pogodnie",
                      rain: "Deszcz",
                      storm: "Burza",
                      snow: "Śnieg",
                    }[snap.weather]}
              </small>
            </aside>
          )}
          {snap.dimension === "end" && snap.dragon >= 0 && !snap.won && (
            <div className="boss-hud">
              <div>
                <span>
                  {snap.dragon <= DRAGON_ENRAGED_HEALTH ? "SMOK ENDU · FURIA" : "SMOK ENDU"}
                </span>
                <small>
                  {Math.ceil(snap.dragon)} / {DRAGON_MAX_HEALTH}
                </small>
              </div>
              <div className="boss-track">
                <i
                  style={{
                    width: Math.max(0, Math.min(1, snap.dragon / DRAGON_MAX_HEALTH)) * 100 + "%",
                  }}
                />
              </div>
              <p>
                {snap.crystals
                  ? `${snap.crystals} kryształów leczy smoka`
                  : snap.dragon <= DRAGON_ENRAGED_HEALTH
                    ? "Furia • Unikaj potrójnych salw"
                    : "Kryształy zniszczone • Atakuj smoka"}
              </p>
            </div>
          )}
          {snap.active && !snap.rest && (
            <>
              <div className="crosshair" aria-hidden="true">
                <i />
                <b />
              </div>
            </>
          )}
          {snap.won && (
            <div className="victory-badge">
              <Sparkles size={18} />
              <span>
                POGROMCA SMOKA <small>+500 punktów doświadczenia</small>
              </span>
            </div>
          )}
          <div className="bottom-hud">
            {snap.rest && runtime && (
              <BedStatus
                elapsed={snap.rest.elapsed}
                night={snap.night}
                nightSkipped={snap.rest.nightSkipped}
                exitKey={keyName(settings.bindings.sneak)}
                onExit={() => runtime.endRest()}
              />
            )}
            <div
              className="held-name"
              key={`held-${snap.selected}-${snap.hotbar[snap.selected] ?? 0}`}
            >
              {snap.hotbar[snap.selected] ? item(snap.hotbar[snap.selected]).name : "Pusta ręka"}
              {[105, 113].includes(snap.hotbar[snap.selected]) && snap.mode === "survival"
                ? ` · ${snap.inventory[113] ?? 0} strzał`
                : ""}
            </div>
            {snap.oxygen < 20 && snap.mode === "survival" && (
              <div className="oxygen-meter" aria-label={`Tlen: ${Math.ceil(snap.oxygen)} z 20`}>
                {Array.from({ length: 10 }, (_, i) => (
                  <i key={i} className={snap.oxygen > i * 2 ? "full" : ""} />
                ))}
              </div>
            )}
            <div className="vitals">
              {snap.mode === "survival" ? (
                <>
                  <div className="hearts" aria-label={`Zdrowie ${snap.health} z 20`}>
                    {Array.from({ length: 10 }, (_, i) => (
                      <Heart
                        key={i}
                        size={19}
                        fill={snap.health > i * 2 ? "#e78370" : "#34433c"}
                        stroke={snap.health > i * 2 ? "#ffd4b2" : "#607166"}
                        strokeWidth={1.5}
                      />
                    ))}
                  </div>
                  <div className="food" aria-label={`Głód ${snap.food} z 20`}>
                    {Array.from({ length: 10 }, (_, i) => (
                      <Drumstick
                        key={i}
                        size={17}
                        fill={snap.food > i * 2 ? "#dfb878" : "#34433c"}
                        stroke={snap.food > i * 2 ? "#f1d5a5" : "#607166"}
                        strokeWidth={1.5}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <span className="creative-caption">
                  NIEOGRANICZONE MOŻLIWOŚCI <b>∞</b>
                </span>
              )}
            </div>
            <div className="xp-line">
              <i style={{ width: (snap.xp % 50) * 2 + "%" }} />
              <b>{Math.floor(snap.xp / 50)}</b>
            </div>
            <div className="hotbar">
              {snap.hotbar.map((id, i) => (
                <button
                  key={i}
                  className={snap.selected === i ? "slot selected" : "slot"}
                  onClick={() => runtime?.select(i)}
                  title={`${i + 1} · ${item(id).name}`}
                  aria-label={`${item(id).name}, pole ${i + 1}`}
                >
                  <span className="slot-key">{i + 1}</span>
                  <ItemIcon id={id} />
                  <span className="slot-count">
                    {id ? (snap.mode === "creative" ? "∞" : (snap.pack.slots[i]?.n ?? 0)) : ""}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="save-indicator">
            <i />
            {runtime?.net ? "Zapis na serwerze" : "Autozapis lokalny"}
          </div>
          {snap.active && runtime && (
            <TouchControls game={runtime} open={open} resting={!!snap.rest} />
          )}
        </>
      )}
      <Dialog
        open={!!panel && !localCaught}
        onOpenChange={(v) => {
          if (!v && panel !== "death") close();
        }}
      >
        <DialogContent
          finalFocus={false}
          className={`game-dialog ${panel === "journal" ? "journal-dialog" : panel === "chest" || panel === "furnace" ? "chest-dialog" : panel === "inventory" || panel === "crafting" ? "inventory-dialog" : panel === "dimensions" ? "dimensions-dialog" : panel === "skin" ? "skin-dialog" : panel === "settings" || panel === "media" ? "settings-dialog" : ""}`}
          showCloseButton={false}
        >
          <div className="panel-heading">
            <div>
              <span className="eyebrow">
                BLOCKLAND /{" "}
                {panel === "inventory" || panel === "crafting" ? "WARSZTAT" : "PRZYGODA"}
              </span>
              <DialogTitle>{title[panel] ?? "Blockland"}</DialogTitle>
            </div>
            {panel !== "death" && (
              <button className="icon-button" onClick={close} aria-label="Zamknij">
                <X size={20} />
              </button>
            )}
          </div>
          <DialogDescription className="panel-description">
            {panel === "journal"
              ? "Czternaście biomów, ukryte skarby i historia, którą napiszesz sam."
              : panel === "chest"
                ? "Odkładaj zapasy i zabieraj przedmioty na kolejną wyprawę."
                : panel === "skin"
                  ? "Maluj na modelu, edytuj dwie warstwy i stwórz własną pelerynę."
                  : panel === "inventory" || panel === "crafting"
                    ? "Przenoś przedmioty między plecakiem, paskiem i siatką wytwarzania."
                    : panel === "settings" || panel === "media"
                      ? "Dopasuj grę do swojego stylu."
                      : panel === "pause"
                        ? "Twój świat, dziennik i sterowanie. Na serwerze inni gracze nadal grają."
                        : panel === "dimensions"
                          ? "Przekrocz portal i odkryj drugą stronę."
                          : panel === "death"
                            ? "Odrodzisz się przy swoim łóżku lub w Zielonej dolinie, z pustym ekwipunkiem. Przedmioty pozostają w miejscu śmierci."
                            : panel === "world"
                              ? "Każde ziarno to inny świat do odkrycia."
                              : "Wszystko, czego potrzebujesz, by postawić pierwszy blok."}
          </DialogDescription>
          {panel === "pause" && (
            <>
              <button className="primary-action" onClick={close}>
                <Play size={18} fill="currentColor" />
                Wróć do gry
                <ArrowRight size={18} />
              </button>
              {snap && <PauseDetails snap={snap} settings={settings} open={open} />}
              <div className="pause-grid">
                <button onClick={() => setPanel("journal")}>
                  <BookOpen />
                  Atlas i osiągnięcia
                </button>
                <button onClick={() => runtime?.pause("inventory")}>
                  <Backpack />
                  Ekwipunek
                </button>
                <button onClick={() => setPanel("dimensions")}>
                  <Compass />
                  Wymiary
                </button>
                <button onClick={() => setPanel("settings")}>
                  <Settings2 />
                  Ustawienia
                </button>
                <button onClick={() => setPanel("skin")}>
                  <Box />
                  Skórka i peleryna
                </button>
                <button onClick={() => setPanel("help")}>
                  <BookOpen />
                  Sterowanie i pomoc
                </button>
              </div>
              <div className="save-actions">
                <button onClick={() => runtime?.exportWorld()}>
                  <Download size={17} />
                  Eksportuj świat
                </button>
                <button onClick={() => importInput.current?.click()}>
                  <Upload size={17} />
                  Importuj świat
                </button>
              </div>
              <button className="quiet-action" onClick={() => runtime?.toMenu()}>
                <HomeIcon size={16} />
                Zapisz i wróć do menu
              </button>
              <p className="panel-footnote">Postęp zapisuje się automatycznie na tym urządzeniu.</p>
            </>
          )}
          {panel === "death" && (
            <>
              <div className="death-symbol">
                <Heart size={48} />
              </div>
              <button className="primary-action" onClick={() => runtime?.respawn()}>
                <RotateCcw size={18} />
                Jeszcze jedna przygoda
                <ArrowRight size={18} />
              </button>
            </>
          )}
          {panel === "world" && (
            <>
              <label className="setting-label" htmlFor="world-seed">
                Ziarno świata
              </label>
              <input
                id="world-seed"
                className="game-input"
                type="number"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
              />
              <div className="mode-picker">
                <button
                  className={mode === "survival" ? "active" : ""}
                  onClick={() => setMode("survival")}
                >
                  <Mountain />
                  <b>Przetrwanie</b>
                  <small>Zbieraj, twórz i walcz.</small>
                </button>
                <button
                  className={mode === "creative" ? "active" : ""}
                  onClick={() => setMode("creative")}
                >
                  <Sparkles />
                  <b>Kreatywny</b>
                  <small>Wszystkie bloki. Pełna swoboda.</small>
                </button>
              </div>
              <DifficultyPicker value={difficulty} onChange={setDifficulty} />
              <button className="primary-action" onClick={newWorld}>
                <Play size={17} />
                Stwórz nowy świat
                <ArrowRight size={18} />
              </button>
              <button className="quiet-action" onClick={() => importInput.current?.click()}>
                <Upload size={16} />
                Wczytaj świat z pliku
              </button>
            </>
          )}
          {panel === "journal" && snap && runtime && <Journal game={runtime} snap={snap} />}
          {panel === "chest" && snap && runtime && <ChestPanel game={runtime} snap={snap} />}
          {panel === "furnace" && snap && runtime && (
            <FurnaceInventory game={runtime} snap={snap} />
          )}
          {(panel === "settings" || panel === "media") && (
            <GameSettingsPanel
              game={runtime ?? undefined}
              initialTab={panel === "media" ? "media" : "graphics"}
              value={settings}
              onChange={changeSettings}
              difficulty={snap?.difficulty ?? difficulty}
              online={!!runtime?.net}
              onDifficultyChange={(value) => {
                setDifficulty(value);
                runtime?.setDifficulty(value);
              }}
            />
          )}
          {panel === "skin" && <SkinEditor />}
          {panel === "multiplayer" && runtime && (
            <MultiplayerMenu game={runtime} onJoined={() => setPanel("")} />
          )}
          {panel === "chat" && runtime?.net && <ChatPanel net={runtime.net} close={close} />}
          {panel === "help" && (
            <>
              <div className="help-grid">
                {[
                  [
                    [
                      settings.bindings.forward,
                      settings.bindings.left,
                      settings.bindings.back,
                      settings.bindings.right,
                    ]
                      .map(keyName)
                      .join(" "),
                    "Poruszanie się",
                  ],
                  ["MYSZ", "Rozglądanie się"],
                  [keyName(settings.bindings.jump), "Skok / pływanie"],
                  [`2× ${keyName(settings.bindings.forward)}`, "Sprint"],
                  [keyName(settings.bindings.sneak), "Kucanie"],
                  [settings.swapMouse ? "PPM" : "LPM", "Kopanie / atak"],
                  [settings.swapMouse ? "LPM" : "PPM", "Blok / jedzenie / łuk"],
                  ["1 – 9", "Wybór przedmiotu"],
                  [keyName(settings.bindings.inventory), "Ekwipunek i crafting"],
                  [keyName(settings.bindings.fly), "Latanie w kreatywnym"],
                  [keyName(settings.bindings.journal), "Atlas i osiągnięcia"],
                  [keyName(settings.bindings.drop), "Wyrzuć przedmiot (Ctrl: cały stos)"],
                  [keyName(settings.bindings.eat), "Jedz (przytrzymaj)"],
                  [keyName(settings.bindings.sprint), "Sprint"],
                  [keyName(settings.bindings.perspective), "Widok trzeciej osoby"],
                  [keyName(settings.bindings.dimensions), "Wymiary i portale"],
                  ["ESC", "Pauza"],
                ].map(([key, label]) => (
                  <div key={key}>
                    <kbd>{key}</kbd>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
              <div className="tip-box">
                <Pickaxe size={22} />
                <p>
                  Przytrzymaj lewy przycisk myszy, aby wydobywać bloki. W ekwipunku wybierz{" "}
                  <b>Wytwarzanie</b>, aby zrobić deski, narzędzia i inne przedmioty.
                </p>
              </div>
              <p className="panel-footnote">
                Na ekranie dotykowym użyj strzałek i przycisków akcji. Przeciągaj po świecie, aby
                się rozglądać.
              </p>
              <button className="primary-action" onClick={close}>
                Ruszamy
                <ArrowRight size={18} />
              </button>
            </>
          )}
          {panel === "dimensions" && (
            <>
              <div className="dimension-cards">
                {(Object.keys(DIMENSIONS) as Dimension[]).map((d, i) => (
                  <article
                    className={`dimension-card dim-${d}`}
                    key={d}
                    style={
                      {
                        "--dimension-color": DIMENSIONS[d].color,
                      } as CSSProperties
                    }
                  >
                    <span className="dim-index">0{i + 1}</span>
                    {d === "overworld" ? (
                      <Mountain size={52} strokeWidth={1} />
                    ) : d === "nether" ? (
                      <Flame size={52} strokeWidth={1} />
                    ) : (
                      <Sparkles size={52} strokeWidth={1} />
                    )}
                    <h3>{DIMENSIONS[d].name}</h3>
                    <p>{DIMENSIONS[d].subtitle}</p>
                    <small>
                      {snap?.dimension === d
                        ? "Jesteś tutaj"
                        : d === "overworld"
                          ? "Powrót przez portal"
                          : d === "nether"
                            ? "Odszukaj i odbuduj zrujnowany portal"
                            : "Portal: X 20 / Z −15"}
                    </small>
                    {snap?.mode === "creative" && snap.dimension !== d && (
                      <button
                        onClick={() => {
                          runtime?.travel(d);
                          close();
                        }}
                      >
                        Przenieś się
                        <ArrowRight size={16} />
                      </button>
                    )}
                  </article>
                ))}
              </div>
              <div className="tip-box">
                <Compass size={22} />
                <p>
                  {snap?.mode === "creative"
                    ? "W trybie kreatywnym możesz swobodnie przenosić się między wymiarami."
                    : "Ruina portalu jest blisko spawnu, przy X −18, Z 12. Woda spływająca na źródło lawy tworzy obsydian. Uzupełnij ramę i użyj krzesiwa."}
                </p>
              </div>
              {snap?.dimension === "end" && !snap.won && (
                <p className="panel-footnote">
                  Najpierw zestrzel kryształy na wieżach. Następnie pokonaj smoka łukiem lub
                  mieczem, gdy obniży lot.
                </p>
              )}
            </>
          )}
          {(panel === "inventory" || panel === "crafting") && snap && runtime && (
            <SlotInventory game={runtime} snap={snap} Icon={ItemIcon} />
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmNew} onOpenChange={setConfirmNew}>
        <AlertDialogContent className="new-world-confirm">
          <AlertDialogTitle>Rozpocząć nowy świat?</AlertDialogTitle>
          <AlertDialogDescription>
            Nowy świat zastąpi bieżący zapis w tej przeglądarce. Możesz najpierw pobrać kopię
            swojego świata.
          </AlertDialogDescription>
          <button className="quiet-action" onClick={() => runtime?.exportWorld()}>
            <Download size={16} />
            Pobierz bieżący świat
          </button>
          <div className="confirm-actions">
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmNew(false);
                start(false);
              }}
            >
              Stwórz świat
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
      <input
        ref={importInput}
        hidden
        type="file"
        accept=".json,application/json"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) {
            if (file.size > 10_000_000) {
              runtime?.notify("Plik jest zbyt duży (maks. 10 MB).");
              return;
            }
            runtime?.importWorld(await file.text());
          }
          e.target.value = "";
        }}
      />
    </main>
  );
}
