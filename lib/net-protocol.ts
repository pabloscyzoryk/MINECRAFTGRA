import type { Dimension } from "./blocks";
import type { MobKind } from "./entities";
export const PROTOCOL = 1;
export const SERVER_NAME = "Wspólny świat";
export const MAX_PLAYERS = 16;
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
  hurt: number;
  fuse: number;
  deathTime: number;
  timer: number;
  target: Vec;
  head?: [number, number];
};
export type DragonWire = {
  hp: number;
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
