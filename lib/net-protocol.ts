import type { Dimension } from "./blocks";
import type { MobKind } from "./entities";
import type { Difficulty } from "./difficulty";
import type { FurnaceState } from "./furnace";
import type { Equipment } from "./armor";
import type { CastleGuardState } from "./castles";
import type { BedRest } from "./bed-rest";
import type { EatingWire } from "./eating";
export type { BedRest } from "./bed-rest";
export type FurnaceWire = { key: string; state: FurnaceState | null; revision: number };
export type { Difficulty } from "./difficulty";
export type { HorrorEvent } from "./horror-director";
export type { HuntWire, HuntPhase } from "./horror-hunt";
export const PROTOCOL = 3;
export const SERVER_NAME = "Wspólny świat";
export const MAX_PLAYERS = 16;
export const FACE_FRAME_MAX_LENGTH = 400000;
export const FACE_TEXTURE_SIZE = 720;
export const FACE_FRAME_INTERVAL = 1 / 3;
export const FACE_FRAME_TIMEOUT = 3000;
export const FACE_ROOM_FRAME_BUDGET = 18;
export type FaceFrameWire = { type: "faceFrame"; sender: string; frame: string | null };
export const DIMENSIONS_NET: Dimension[] = ["overworld", "nether", "end"];
export type Vec = [number, number, number];
export type SkinWire = { skin: string; cape: string; capeEnabled: boolean };
export type PlayerWire = {
  id: string;
  nick: string;
  p: Vec;
  yaw: number;
  pitch: number;
  dimension: Dimension;
  moving: boolean;
  crouch: boolean;
  swing: boolean;
  swingProgress?: number;
  held: number;
  skin?: SkinWire;
  seen: number;
  health?: number;
  difficulty?: Difficulty;
  equipment?: Equipment;
  bedRest?: BedRest | null;
  bedRestRevision?: number;
  eating?: EatingWire | null;
};
export type MobWire = {
  id: string;
  kind: MobKind;
  p: Vec;
  r: Vec;
  hp: number;
  dead: boolean;
  elapsed: number;
  gait: number;
  walkBlend: number;
  heading: number;
  attackClock: number;
  rangedAttack?: boolean;
  hurt: number;
  anger?: number;
  eyeContact?: number;
  angerTarget?: string;
  guard?: CastleGuardState;
  fuse: number;
  deathTime: number;
  timer: number;
  target: Vec;
  head?: [number, number];
};
export type DragonWire = {
  hp: number;
  orbit?: number;
  time: number;
  shot: number;
  radius: number;
  dead: boolean;
  deathTime: number;
  p: Vec;
  r: Vec;
};
export type DropWire = {
  key: string;
  id: number;
  n: number;
  p: Vec;
  v: Vec;
  dimension: Dimension;
  life: number;
  grace: number;
};
export type BlockWire = [Dimension, number, number, number, number, number];
export type FrameWire = {
  type: "frame";
  tick: number;
  clock: number;
  players: PlayerWire[];
  mobs: Partial<Record<Dimension, MobWire[]>>;
  drops: DropWire[];
  dragon: DragonWire | null;
  crystals: number[];
  won: boolean;
  changes: BlockWire[];
  horrorClock?: number;
};
export type Command = { type: string; req: string; [key: string]: unknown };
export function validNick(n: unknown): n is string {
  return typeof n === "string" && /^[\p{L}\p{N}_-]{3,20}$/u.test(n);
}
export function validVec(p: unknown): p is Vec {
  return (
    Array.isArray(p) &&
    p.length === 3 &&
    p.every((v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 100000)
  );
}
export function validToken(t: unknown): t is string {
  return typeof t === "string" && /^[a-f0-9]{64}$/.test(t);
}
export function validSkin(s: unknown): s is SkinWire {
  if (!s || typeof s !== "object") return false;
  const v = s as SkinWire;
  return (
    ["skin", "cape"].every(
      (k) =>
        typeof v[k as "skin" | "cape"] === "string" &&
        v[k as "skin" | "cape"].length < 50000 &&
        /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v[k as "skin" | "cape"]),
    ) && typeof v.capeEnabled === "boolean"
  );
}
export function validVoice(s: unknown): s is string {
  return (
    typeof s === "string" &&
    s.length >= 320 &&
    s.length <= 9000 &&
    s.length % 4 === 0 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(s)
  );
}
/** Only bounded JPEGs are decoded; dimensions are inspected before an image decoder sees them. */
export function validFaceFrame(value: unknown): value is string | null {
  if (value === null) return true;
  if (
    typeof value !== "string" ||
    value.length > FACE_FRAME_MAX_LENGTH ||
    !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
  )
    return false;
  try {
    const bytes = atob(value.slice(23)),
      byte = (i: number) => bytes.charCodeAt(i);
    if (
      bytes.length < 20 ||
      byte(0) !== 255 ||
      byte(1) !== 216 ||
      byte(bytes.length - 2) !== 255 ||
      byte(bytes.length - 1) !== 217
    )
      return false;
    for (let at = 2; at + 4 < bytes.length;) {
      if (byte(at++) !== 255) return false;
      while (byte(at) === 255) at++;
      const marker = byte(at++);
      if (marker === 218 || marker === 217) return false;
      const length = byte(at) * 256 + byte(at + 1);
      if (length < 2 || at + length > bytes.length) return false;
      if ([192, 193, 194].includes(marker)) {
        if (length < 8 || byte(at + 2) !== 8) return false;
        const height = byte(at + 3) * 256 + byte(at + 4),
          width = byte(at + 5) * 256 + byte(at + 6);
        return width >= 16 && width <= 1024 && height >= 16 && height <= 1024;
      }
      at += length;
    }
  } catch {}
  return false;
}
