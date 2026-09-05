import { BLOCKS, type Dimension } from "./blocks";
import { bedPartner } from "./bed";
import { SHAPES, CARDINAL, boxList, worldBoxCollision, type V3 } from "./block-shapes";
import { isSafeStandingPosition } from "./safe-spawn";

export const BED_REST_SECONDS = 10;
export const isBedNight = (clock: number) => ((clock % 600) + 600) % 600 > 348;
export type BedRest = {
  key: string;
  dimension: Dimension;
  foot: V3;
  head: V3;
  facing: number;
  p: V3;
  yaw: number;
  elapsed: number;
  nightSkipped: boolean;
  legacy?: boolean;
};
export type RestWorld = {
  dimension: Dimension;
  get(x: number, y: number, z: number): number;
  chunk?(x: number, z: number): unknown;
};
export function resolveBedRest(world: RestWorld, x: number, y: number, z: number): BedRest | null {
  if (world.dimension !== "overworld" || ![x, y, z].every(Number.isInteger)) return null;
  world.chunk?.(Math.floor(x / 16), Math.floor(z / 16));
  const id = world.get(x, y, z),
    s = SHAPES[id];
  if (s?.kind !== "bed") return null;
  const other = bedPartner(id, x, y, z);
  if (other) {
    world.chunk?.(Math.floor(other.x / 16), Math.floor(other.z / 16));
    if (world.get(other.x, other.y, other.z) !== other.id) return null;
  }
  const foot: V3 = s.head && other ? [other.x, other.y, other.z] : [x, y, z],
    head: V3 = !s.head && other ? [other.x, other.y, other.z] : [x, y, z];
  const p: V3 = [(foot[0] + head[0]) / 2 + 0.5, y + 0.5625, (foot[2] + head[2]) / 2 + 0.5];
  const rest: BedRest = {
    key: world.dimension + ":" + foot.join(","),
    dimension: world.dimension,
    foot,
    head,
    facing: s.facing,
    p,
    yaw: (-s.facing * Math.PI) / 2,
    elapsed: 0,
    nightSkipped: false,
    ...(!other ? { legacy: true } : {}),
  };
  // A sleeper's body is horizontal, so a low ceiling is allowed only above the actual body.
  if (
    worldBoxCollision(
      [
        Math.min(foot[0], head[0]) + 0.12,
        y + 0.563,
        Math.min(foot[2], head[2]) + 0.12,
        Math.max(foot[0], head[0]) + 0.88,
        y + 1.13,
        Math.max(foot[2], head[2]) + 0.88,
      ],
      (a, b, c) => world.get(a, b, c),
      (id) => !!BLOCKS[id]?.solid,
    )
  )
    return null;
  return rest;
}
export function bedRestValid(world: RestWorld, rest: BedRest) {
  if (world.dimension !== rest.dimension) return false;
  if (rest.legacy) return world.get(...rest.foot) === 62;
  return (
    world.get(...rest.foot) === 190 + rest.facing && world.get(...rest.head) === 194 + rest.facing
  );
}
export function advanceBedRest(rest: BedRest, dt: number, clock: number) {
  if (Number.isFinite(dt) && dt > 0) rest.elapsed = Math.min(BED_REST_SECONDS, rest.elapsed + dt);
  const night = isBedNight(clock);
  if (rest.elapsed >= BED_REST_SECONDS - 1e-8 && night && !rest.nightSkipped) {
    rest.elapsed = BED_REST_SECONDS;
    rest.nightSkipped = true;
    return { clock: Math.floor(clock / 600) * 600 + 690, skipped: true };
  }
  return { clock, skipped: false };
}
export function bedRestEye(rest: BedRest): V3 {
  const d = CARDINAL[rest.facing];
  return [
    rest.head[0] + 0.5 + d[0] * (rest.legacy ? 0.08 : 0.22),
    rest.head[1] + 0.91,
    rest.head[2] + 0.5 + d[2] * (rest.legacy ? 0.08 : 0.22),
  ];
}
export function bedRestPose(rest: BedRest): { p: V3; yaw: number } {
  const d = CARDINAL[rest.facing];
  return {
    p: [
      rest.foot[0] + 0.5 - d[0] * (rest.legacy ? 0.42 : 0.32),
      rest.foot[1] + 0.72,
      rest.foot[2] + 0.5 - d[2] * (rest.legacy ? 0.42 : 0.32),
    ],
    yaw: rest.yaw,
  };
}
/** Searches real box support/clearance; never exits into water, lava, a ceiling or another bed. */
export function bedRestExit(world: RestWorld, rest: BedRest, fallback?: V3): V3 | null {
  const solid = (id: number) => !!BLOCKS[id]?.solid;
  const valid = (p: V3) => isSafeStandingPosition(world, p);
  const cells: { x: number; z: number; distance: number }[] = [];
  for (let x = rest.foot[0] - 4; x <= rest.foot[0] + 4; x++)
    for (let z = rest.foot[2] - 4; z <= rest.foot[2] + 4; z++) {
      if ((x === rest.foot[0] && z === rest.foot[2]) || (x === rest.head[0] && z === rest.head[2]))
        continue;
      cells.push({ x, z, distance: Math.hypot(x + 0.5 - rest.p[0], z + 0.5 - rest.p[2]) });
    }
  cells.sort((a, b) => a.distance - b.distance);
  for (const c of cells) world.chunk?.(Math.floor(c.x / 16), Math.floor(c.z / 16));
  for (const c of cells) {
    const candidates: number[] = [];
    for (let y = Math.max(0, rest.foot[1] - 4); y <= Math.min(71, rest.foot[1] + 3); y++) {
      const id = world.get(c.x, y, c.z);
      if (!solid(id) || SHAPES[id]?.kind === "bed") continue;
      for (const b of boxList(id)) candidates.push(y + b[4]);
    }
    candidates.sort((a, b) => Math.abs(a - rest.foot[1]) - Math.abs(b - rest.foot[1]));
    for (const y of candidates) {
      const p: V3 = [c.x + 0.5, y, c.z + 0.5];
      if (valid(p)) return p;
    }
  }
  if (fallback) {
    world.chunk?.(Math.floor(fallback[0] / 16), Math.floor(fallback[2] / 16));
    if (valid(fallback)) return fallback;
  }
  // A newly sealed room still permits waking on the nearest safe roof, never inside the ceiling.
  for (const c of cells)
    for (let y = rest.foot[1] + 4; y <= 72; y++) {
      const p: V3 = [c.x + 0.5, y, c.z + 0.5];
      if (valid(p)) return p;
    }
  return null;
}
