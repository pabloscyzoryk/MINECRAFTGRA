"use client";
import { useEffect, useState } from "react";
import { Monitor, CloudRain, Volume2, Keyboard, Eye, RotateCcw, Mic } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import DifficultyPicker from "@/components/difficulty-picker";
import VoiceSettings from "@/components/voice-settings";
import CameraSettings from "@/components/camera-settings";
import { NetworkPlayers } from "@/components/multiplayer-menu";
import type { Game } from "@/lib/engine";
import type { Difficulty } from "@/lib/difficulty";
import {
  SHADERS,
  DEFAULT_SETTINGS,
  DEFAULT_BINDINGS,
  ACTION_LABELS,
  keyName,
  type Action,
  type GameSettings,
  type WeatherMode,
  type ShaderStyle,
} from "@/lib/settings";
export default function GameSettingsPanel({
  value,
  onChange,
  difficulty = "normal",
  onDifficultyChange,
  online = false,
  game,
  initialTab = "graphics",
}: {
  value: GameSettings;
  onChange: (s: Partial<GameSettings>) => void;
  difficulty?: Difficulty;
  onDifficultyChange?: (value: Difficulty) => void;
  online?: boolean;
  game?: Game;
  initialTab?: string;
}) {
  const [capture, setCapture] = useState<Action | null>(null),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (!capture) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code === "Escape") {
        setCapture(null);
        return;
      }
      if (["MetaLeft", "MetaRight", "AltLeft", "AltRight", "Tab"].includes(e.code)) {
        setMessage("Wybierz inny klawisz. Ten jest używany przez przeglądarkę.");
        return;
      }
      const bindings = { ...value.bindings },
        old = bindings[capture],
        other = (Object.keys(bindings) as Action[]).find(
          (a) => a !== capture && bindings[a] === e.code,
        );
      if (other) bindings[other] = old;
      bindings[capture] = e.code;
      onChange({ bindings });
      setMessage(
        `${ACTION_LABELS[capture]} → ${keyName(e.code)}${other ? " · zamieniono przypisania" : ""}`,
      );
      setCapture(null);
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [capture, value.bindings, onChange]);
  const range = (
    key: keyof GameSettings,
    label: string,
    min: number,
    max: number,
    step: number,
    display: string,
  ) => (
    <div className="setting">
      <div>
        <label id={"setting-" + key}>{label}</label>
        <b>{display}</b>
      </div>
      <Slider
        aria-labelledby={"setting-" + key}
        value={[value[key] as number]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange({ [key]: Array.isArray(v) ? v[0] : v })}
      />
    </div>
  );
  const toggle = (key: keyof GameSettings, label: string, note?: string) => (
    <div className="switch-setting">
      <div>
        <label htmlFor={"switch-" + key}>{label}</label>
        {note && <small>{note}</small>}
      </div>
      <Switch
        id={"switch-" + key}
        checked={value[key] as boolean}
        onCheckedChange={(v) => onChange({ [key]: v })}
      />
    </div>
  );
  return (
    <Tabs defaultValue={initialTab} className="settings-tabs">
      <TabsList className="inventory-tabs">
        <TabsTrigger value="graphics">
          <Monitor size={15} />
          Grafika
        </TabsTrigger>
        <TabsTrigger value="world">
          <CloudRain size={15} />
          Świat
        </TabsTrigger>
        <TabsTrigger value="audio">
          <Volume2 size={15} />
          Dźwięk
        </TabsTrigger>
        {game && (
          <TabsTrigger value="media">
            <Mic size={15} />
            Mikrofon i kamera
          </TabsTrigger>
        )}
        <TabsTrigger value="controls">
          <Keyboard size={15} />
          Sterowanie
        </TabsTrigger>
        <TabsTrigger value="interface">
          <Eye size={15} />
          Interfejs
        </TabsTrigger>
      </TabsList>
      <TabsContent value="graphics">
        <div className="settings-scroll">
          <div className="section-label" id="shader-label">
            Shader
          </div>
          <RadioGroup
            value={value.shader}
            onValueChange={(v) => onChange({ shader: v as ShaderStyle })}
            aria-labelledby="shader-label"
            className="shader-grid"
          >
            {SHADERS.map((s) => (
              <label
                key={s.id}
                htmlFor={"shader-" + s.id}
                className={`shader-option shader-${s.id} ${value.shader === s.id ? "chosen" : ""}`}
              >
                <RadioGroupItem id={"shader-" + s.id} value={s.id} />
                <span>
                  <b>{s.name}</b>
                  <small>{s.description}</small>
                </span>
              </label>
            ))}
          </RadioGroup>
          <div className="settings-content">
            {range("view", "Zasięg widzenia", 2, 6, 1, `${value.view * 16} bloków`)}
            {range(
              "resolution",
              "Rozdzielczość renderowania",
              0.5,
              2,
              0.25,
              `${Math.round(value.resolution * 100)}%`,
            )}
            {range("fov", "Pole widzenia", 50, 100, 1, `${value.fov}°`)}
            {range(
              "fog",
              "Przejrzystość powietrza",
              0.5,
              1.5,
              0.1,
              `${Math.round(value.fog * 100)}%`,
            )}
            {toggle("shadows", "Miękkie cienie", "Wyłącz, jeśli potrzebujesz więcej płynności.")}
            {toggle("particles", "Cząsteczki bloków i efektów")}
            {toggle("viewBob", "Kołysanie kamery i dłoni")}
          </div>
        </div>
      </TabsContent>
      <TabsContent value="world">
        <div className="settings-scroll">
          {onDifficultyChange && (
            <DifficultyPicker value={difficulty} onChange={onDifficultyChange} online={online} />
          )}
          <div className="section-label" id="weather-label">
            Pogoda
          </div>
          <RadioGroup
            value={value.weather}
            onValueChange={(v) => onChange({ weather: v as WeatherMode })}
            aria-labelledby="weather-label"
            className="weather-options"
          >
            {[
              ["auto", "Zmienna"],
              ["clear", "Słonecznie"],
              ["rain", "Deszcz"],
              ["storm", "Burza"],
              ["snow", "Śnieg"],
            ].map(([id, name]) => (
              <label key={id} htmlFor={"weather-" + id}>
                <RadioGroupItem id={"weather-" + id} value={id} />
                {name}
              </label>
            ))}
          </RadioGroup>
          <div className="settings-content">
            {range(
              "weatherDensity",
              "Gęstość opadów",
              0.1,
              1,
              0.1,
              `${Math.round(value.weatherDensity * 100)}%`,
            )}
            {toggle(
              "dayCycle",
              "Cykl dnia i nocy",
              "Słońce zachodzi, a nocą pojawiają się potwory.",
            )}
            {value.dayCycle
              ? range(
                  "dayDuration",
                  "Długość doby",
                  120,
                  1800,
                  60,
                  `${Math.round(value.dayDuration / 60)} minut`,
                )
              : range(
                  "timeOfDay",
                  "Pora dnia",
                  0,
                  99,
                  1,
                  `${String(Math.floor(((value.timeOfDay / 100) * 24 + 6) % 24)).padStart(2, "0")}:00`,
                )}
            <p className="panel-footnote">
              W trybie zmiennej pogody opady i przejaśnienia zmieniają się w czasie. W śnieżnych
              biomach pada śnieg.
            </p>
          </div>
        </div>
      </TabsContent>
      <TabsContent value="audio">
        <div className="settings-scroll settings-content">
          {range(
            "horrorVolume",
            "Gość — dźwięki horroru",
            0,
            1,
            0.05,
            `${Math.round(value.horrorVolume * 100)}%`,
          )}
          {toggle(
            "horrorJumpscares",
            "Nagłe straszenia w trybie Horror",
            "Wyłącza nagłe zbliżenie twarzy i krzyk. Polowanie oraz śmierć po schwytaniu nadal działają. Zmiana trudności z Horror wyłącza całe zagrożenie.",
          )}
          {range("volume", "Efekty gry", 0, 1, 0.05, `${Math.round(value.volume * 100)}%`)}
          {range("music", "Muzyka ambientowa", 0, 1, 0.05, `${Math.round(value.music * 100)}%`)}
          {range(
            "weatherVolume",
            "Deszcz i wiatr",
            0,
            1,
            0.05,
            `${Math.round(value.weatherVolume * 100)}%`,
          )}
          <div className="tip-box">
            <Volume2 size={22} />
            <p>
              Spokojna muzyka generowana na żywo towarzyszy eksploracji. Pogoda, kroki, kopanie i
              walka mają osobne efekty dźwiękowe.
            </p>
          </div>
        </div>
      </TabsContent>
      {game && (
        <TabsContent value="media">
          <div className="settings-scroll media-settings">
            <div className="media-shortcuts">
              <span>Rozmowa i Twój wygląd na żywo</span>
              <button
                onClick={(event) =>
                  event.currentTarget
                    .closest(".media-settings")
                    ?.querySelector(".camera-settings")
                    ?.scrollIntoView({ block: "start", behavior: "smooth" })
                }
              >
                Przejdź do kamerki ↓
              </button>
            </div>
            {game.net?.connected && <NetworkPlayers game={game} />}
            <VoiceSettings voice={game.voice} localOnly={!online} />
            <CameraSettings camera={game.faceCamera} />
          </div>
        </TabsContent>
      )}
      <TabsContent value="controls">
        <div className="settings-scroll">
          <div className="settings-content">
            {range(
              "sensitivity",
              "Czułość myszy",
              0.2,
              2.5,
              0.1,
              `${value.sensitivity.toFixed(1)}×`,
            )}
            {toggle("invertY", "Odwróć pionową oś myszy")}
            {toggle(
              "doubleTapSprint",
              "Sprint po podwójnym naciśnięciu przodu",
              "Domyślnie 2× W. Shift służy do kucania.",
            )}
            {toggle("swapMouse", "Zamień lewy i prawy przycisk myszy")}
          </div>
          <div className="bindings-heading">
            <b>Przypisanie klawiszy</b>
            <button
              onClick={() => {
                onChange({ bindings: { ...DEFAULT_BINDINGS } });
                setCapture(null);
              }}
            >
              <RotateCcw size={14} />
              Domyślne
            </button>
          </div>
          {capture && (
            <output className="binding-capture">
              {ACTION_LABELS[capture]}: naciśnij klawisz. Esc anuluje.
            </output>
          )}
          <div className="binding-list">
            {(Object.keys(ACTION_LABELS) as Action[]).map((action) => (
              <div key={action}>
                <span>{ACTION_LABELS[action]}</span>
                <button
                  className={capture === action ? "capturing" : ""}
                  onClick={() => setCapture(action)}
                  aria-label={`Zmień klawisz: ${ACTION_LABELS[action]}`}
                >
                  {capture === action ? "…" : keyName(value.bindings[action])}
                </button>
              </div>
            ))}
          </div>
          <output className="panel-footnote">
            {message || "Kliknij klawisz i naciśnij nowy. Zajęte klawisze zamieniają przypisania."}
          </output>
        </div>
      </TabsContent>
      <TabsContent value="interface">
        <div className="settings-scroll settings-content">
          {toggle("minimap", "Minimapa")}
          {toggle("showFPS", "Licznik klatek na sekundę")}
          {toggle("showHints", "Podpowiedzi sterowania")}
          <p className="panel-footnote">Ustawienia są zapisywane na tym urządzeniu.</p>
          <button
            className="quiet-action"
            onClick={() =>
              onChange({
                ...DEFAULT_SETTINGS,
                bindings: { ...DEFAULT_BINDINGS },
              })
            }
          >
            <RotateCcw size={16} />
            Przywróć wszystkie ustawienia
          </button>
        </div>
      </TabsContent>
    </Tabs>
  );
}
