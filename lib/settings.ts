export const DEFAULT_BINDINGS = {
  forward: "KeyW",
  back: "KeyS",
  left: "KeyA",
  right: "KeyD",
  jump: "Space",
  sneak: "ShiftLeft",
  sprint: "ControlLeft",
  inventory: "KeyE",
  journal: "KeyJ",
  dimensions: "KeyM",
  help: "KeyH",
  fly: "KeyF",
  eat: "KeyR",
  drop: "KeyQ",
  perspective: "F5",
  slot1: "Digit1",
  slot2: "Digit2",
  slot3: "Digit3",
  slot4: "Digit4",
  slot5: "Digit5",
  slot6: "Digit6",
  slot7: "Digit7",
  slot8: "Digit8",
  slot9: "Digit9",
};
export type Action = keyof typeof DEFAULT_BINDINGS;
export const ACTION_LABELS: Record<Action, string> = {
  forward: "Do przodu",
  back: "Do tyłu",
  left: "W lewo",
  right: "W prawo",
  jump: "Skok / pływanie / lot w górę",
  sneak: "Kucanie / lot w dół",
  sprint: "Sprint (również 2× W)",
  inventory: "Ekwipunek",
  journal: "Atlas i osiągnięcia",
  dimensions: "Wymiary",
  help: "Pomoc",
  fly: "Przełącz latanie",
  eat: "Zjedz przedmiot",
  drop: "Wyrzuć przedmiot (Ctrl: cały stos)",
  perspective: "Perspektywa kamery",
  slot1: "Pole 1",
  slot2: "Pole 2",
  slot3: "Pole 3",
  slot4: "Pole 4",
  slot5: "Pole 5",
  slot6: "Pole 6",
  slot7: "Pole 7",
  slot8: "Pole 8",
  slot9: "Pole 9",
};
export type ShaderStyle = "classic" | "cinematic" | "vivid" | "retro" | "soft";
export type WeatherMode = "auto" | "clear" | "rain" | "storm" | "snow";
export type GameSettings = {
  sensitivity: number;
  volume: number;
  music: number;
  weatherVolume: number;
  view: number;
  fov: number;
  shadows: boolean;
  shader: ShaderStyle;
  resolution: number;
  fog: number;
  weather: WeatherMode;
  weatherDensity: number;
  dayCycle: boolean;
  dayDuration: number;
  timeOfDay: number;
  invertY: boolean;
  viewBob: boolean;
  minimap: boolean;
  showFPS: boolean;
  showHints: boolean;
  particles: boolean;
  doubleTapSprint: boolean;
  swapMouse: boolean;
  bindings: Record<Action, string>;
};
export const DEFAULT_SETTINGS: GameSettings = {
  sensitivity: 1,
  volume: 0.5,
  music: 0.25,
  weatherVolume: 0.3,
  view: 4,
  fov: 72,
  shadows: true,
  shader: "cinematic",
  resolution: 1.25,
  fog: 1,
  weather: "auto",
  weatherDensity: 0.8,
  dayCycle: true,
  dayDuration: 600,
  timeOfDay: 20,
  invertY: false,
  viewBob: true,
  minimap: true,
  showFPS: true,
  showHints: true,
  particles: true,
  doubleTapSprint: true,
  swapMouse: false,
  bindings: { ...DEFAULT_BINDINGS },
};
export const SHADERS: { id: ShaderStyle; name: string; description: string }[] = [
  {
    id: "classic",
    name: "Klasyczny",
    description: "Ostre piksele i naturalne kolory.",
  },
  {
    id: "cinematic",
    name: "Filmowy",
    description: "Ciepłe światło, poświata i głębokie cienie.",
  },
  {
    id: "vivid",
    name: "Żywe kolory",
    description: "Wyrazista zieleń i czysta, błękitna woda.",
  },
  {
    id: "soft",
    name: "Miękkie światło",
    description: "Pastelowe światło i subtelna poświata.",
  },
  {
    id: "retro",
    name: "Retro",
    description: "Ograniczona paleta i lekka ziarnistość.",
  },
];
export function keyName(code: unknown) {
  if (typeof code !== "string" || !code) return "Nie przypisano";
  return code
    .replace("Key", "")
    .replace("Digit", "")
    .replace("Left", " L")
    .replace("Right", " P")
    .replace("Space", "Spacja")
    .replace("Control", "Ctrl")
    .replace("Arrow", "Strzałka ");
}
