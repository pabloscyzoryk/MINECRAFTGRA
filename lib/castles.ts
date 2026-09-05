import { biomeSample } from "./biomes";

export type CastleKind = "citadel" | "ruined";
export type CastleSite = {
  id: string;
  kind: CastleKind;
  name: string;
  x: number;
  z: number;
  halfSize: number;
  biome: string;
};
export type CastleDescriptor = CastleSite & {
  y: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  entrance: [number, number, number];
  approachY: number;
  guards: { id: string; p: [number, number, number] }[];
  loot: { p: [number, number, number]; role: "armory" | "library" | "treasury" | "tower" }[];
};
export type CastleGuardState = {
  id: string;
  castleId: string;
  home: [number, number, number];
  post: [number, number, number];
  radius: number;
};
const CELL = 512,
  REACH = 70;
const suitable = new Set(["plains", "forest", "birch", "taiga", "cherry", "flower", "snow"]);
const random = (x: number, z: number, seed: number) => {
  let n = Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed, 144269);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};
const firstCache = new Map<number, CastleSite>();
const site = (seed: number, x: number, z: number, id: string, kind?: CastleKind): CastleSite => {
  const biome = biomeSample(x, z, seed).biome.id;
  const variant =
    kind ??
    (["forest", "taiga", "birch"].includes(biome) && random(x, z, seed + 607) < 0.6
      ? "ruined"
      : "citadel");
  return {
    id,
    kind: variant,
    x,
    z,
    halfSize: 36,
    biome,
    name:
      variant === "ruined"
        ? "Ruiny Twierdzy Cisowych Wzgórz"
        : biome === "snow"
          ? "Zamek Srebrnej Grani"
          : "Zamek Zielonej Chorągwi",
  };
};

/** One discoverable castle stays outside the village/portal area; no chunks are generated here. */
export function firstCastle(seed: number): CastleSite {
  const cached = firstCache.get(seed);
  if (cached) return cached;
  const phase = random(seed, 17, 721) * Math.PI * 2;
  let chosen: CastleSite | undefined;
  for (let i = 0; i < 16; i++) {
    const angle = phase + (i * Math.PI) / 8,
      radius = 240 + (i % 3) * 24;
    const candidate = site(
      seed,
      Math.round(Math.cos(angle) * radius),
      Math.round(Math.sin(angle) * radius),
      "castle:first",
      "citadel",
    );
    chosen ??= candidate;
    if (suitable.has(candidate.biome)) {
      chosen = candidate;
      break;
    }
  }
  if (firstCache.size >= 128) firstCache.delete(firstCache.keys().next().value!);
  firstCache.set(seed, chosen!);
  return chosen!;
}

/** Sparse spatial lookup: a chunk inspects at most four lattice cells, never the whole world. */
export function castleSites(seed: number, x: number, z: number, radius = 96): CastleSite[] {
  if (![seed, x, z, radius].every(Number.isFinite)) return [];
  radius = Math.max(0, Math.min(2048, radius));
  const first = firstCastle(seed),
    result: CastleSite[] = [];
  const nearby = (s: CastleSite) =>
    Math.abs(s.x - x) <= radius + REACH && Math.abs(s.z - z) <= radius + REACH;
  if (nearby(first)) result.push(first);
  for (
    let cx = Math.floor((x - radius - REACH) / CELL);
    cx <= Math.floor((x + radius + REACH) / CELL);
    cx++
  )
    for (
      let cz = Math.floor((z - radius - REACH) / CELL);
      cz <= Math.floor((z + radius + REACH) / CELL);
      cz++
    ) {
      if (random(cx, cz, seed + 613) > 0.32) continue;
      const sx = cx * CELL + 100 + Math.floor(random(cx, cz, seed + 617) * 310);
      const sz = cz * CELL + 100 + Math.floor(random(cx, cz, seed + 619) * 310);
      if (Math.hypot(sx, sz) < 190 || Math.hypot(sx - first.x, sz - first.z) < 180) continue;
      const candidate = site(seed, sx, sz, `castle:${cx},${cz}`);
      if (suitable.has(candidate.biome) && nearby(candidate)) result.push(candidate);
    }
  return result;
}

export function describeCastle(
  s: CastleSite,
  height: (x: number, z: number) => number,
): CastleDescriptor {
  const samples = [-22, 0, 22]
    .flatMap((x) => [-22, 0, 22].map((z) => height(s.x + x, s.z + z)))
    .sort((a, b) => a - b);
  const y = Math.max(16, Math.min(34, Math.round(samples[5]) + 1));
  const guardOffsets = [
    [-5, 24],
    [5, 24],
    [-17, 10],
    [17, 10],
  ];
  return {
    ...s,
    y,
    bounds: { minX: s.x - 36, maxX: s.x + 36, minZ: s.z - 36, maxZ: s.z + 69 },
    entrance: [s.x, y, s.z + 35],
    approachY: Math.max(3, Math.min(60, height(s.x, s.z + 69) + 1)),
    guards: guardOffsets
      .slice(0, s.kind === "ruined" ? 3 : 4)
      .map(([x, z], i) => ({ id: `${s.id}:guard:${i}`, p: [s.x + x + 0.5, y, s.z + z + 0.5] })),
    loot: [
      { p: [s.x - 21, y, s.z + 4], role: "armory" },
      { p: [s.x + 8, y + 6, s.z - 6], role: "library" },
      { p: [s.x + 8, y + 12, s.z - 16], role: "treasury" },
      { p: [s.x + 29, y + 8, s.z + 29], role: "tower" },
    ],
  };
}

export function castleLoot(
  c: CastleDescriptor,
  x: number,
  y: number,
  z: number,
): Record<number, number> | null {
  const role = c.loot.find(
    (entry) => entry.p[0] === x && entry.p[1] === y && entry.p[2] === z,
  )?.role;
  if (!role) return null;
  if (role === "armory") return { 104: 1, 131: 1, 113: 24, 110: 5, 107: 5 };
  if (role === "library") return { 119: 2, 137: 8, 110: 3, 107: 3 };
  if (role === "treasury") return { 111: c.kind === "ruined" ? 3 : 5, 133: 8, 136: 3, 149: 1 };
  return { 105: 1, 113: 24, 110: 4, 107: 4 };
}

/** Writes only the intersecting chunk's base voxels. World edits are applied afterwards. */
export function generateCastleChunk(
  castle: CastleDescriptor,
  chunk: { cx: number; cz: number; data: Uint8Array },
  seed: number,
) {
  const ox = chunk.cx * 16,
    oz = chunk.cz * 16,
    maxY = chunk.data.length / 256;
  if (
    ox > castle.bounds.maxX ||
    ox + 15 < castle.bounds.minX ||
    oz > castle.bounds.maxZ ||
    oz + 15 < castle.bounds.minZ
  )
    return;
  const { x: cx, y, z: cz } = castle,
    stone = castle.kind === "ruined" ? 40 : 9;
  const put = (x: number, yy: number, z: number, id: number) => {
    x += cx;
    z += cz;
    if (x >= ox && x < ox + 16 && z >= oz && z < oz + 16 && yy >= 1 && yy < maxY)
      chunk.data[x - ox + (z - oz) * 16 + yy * 256] = id;
  };
  const fill = (
    x: number,
    yy: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    id: number,
  ) => {
    const ax = Math.max(ox, cx + x),
      bx = Math.min(ox + 16, cx + x + width);
    const az = Math.max(oz, cz + z),
      bz = Math.min(oz + 16, cz + z + depth);
    if (ax >= bx || az >= bz) return;
    for (let h = Math.max(1, yy); h < Math.min(maxY, yy + height); h++)
      for (let zz = az; zz < bz; zz++)
        for (let xx = ax; xx < bx; xx++) chunk.data[xx - ox + (zz - oz) * 16 + h * 256] = id;
  };
  const shell = (
    x: number,
    yy: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    id: number,
  ) => {
    fill(x, yy, z, width, height, 1, id);
    fill(x, yy, z + depth - 1, width, height, 1, id);
    fill(x, yy, z, 1, height, depth, id);
    fill(x + width - 1, yy, z, 1, height, depth, id);
  };
  // A supported terrace removes trees inside the footprint without pregenerating neighbours.
  fill(-36, 1, -36, 73, y - 1, 73, stone);
  fill(-36, y, -36, 73, maxY - y, 73, 0);
  fill(-35, y - 1, -35, 71, 1, 71, 1);
  fill(-4, y - 1, -34, 9, 1, 70, stone);
  fill(-31, y - 1, 8, 63, 1, 7, stone);
  // Four broad, walkable curtains with crenellations and a full-height gate arch.
  for (const side of [-1, 1]) {
    fill(-29, y, side < 0 ? -33 : 31, 59, 9, 3, stone);
    fill(side < 0 ? -33 : 31, y, -29, 3, 9, 59, stone);
    for (let n = -28; n <= 28; n += 3) {
      fill(n, y + 9, side * 33, 2, 2, 1, stone);
      fill(side * 33, y + 9, n, 1, 2, 2, stone);
    }
  }
  fill(-3, y, 30, 7, 6, 5, 0);
  fill(-4, y + 6, 30, 9, 1, 5, 11);
  for (const x of [-6, 6]) {
    fill(x, y, 30, 2, 8, 5, 11);
    put(x, y + 5, 35, 48);
  }
  // A stepped approach brings the raised gate down to the surrounding terrain.
  for (let z = 37; z <= 69; z++) {
    const difference = castle.approachY - y;
    const h = y + Math.sign(difference) * Math.min(Math.abs(difference), z - 37);
    fill(-3, 1, z, 7, Math.max(1, h - 1), 1, stone);
    fill(-3, h, z, 7, maxY - h, 1, 0);
    fill(-3, h - 1, z, 7, 1, 1, stone);
    if (z > 37 && z - 37 <= Math.abs(difference))
      fill(-3, difference < 0 ? h : h - 1, z, 7, 1, 1, difference < 0 ? 182 : 184);
  }
  // Each tower has two switchback staircases, landings and doors onto the walls.
  for (const tx of [-29, 29])
    for (const tz of [-29, 29]) {
      fill(tx - 4, y - 1, tz - 4, 9, 1, 9, stone);
      shell(tx - 4, y, tz - 4, 9, 17, 9, stone);
      for (const level of [8, 16]) fill(tx - 3, y + level - 1, tz - 3, 7, 1, 7, stone);
      for (const level of [0, 8]) {
        fill(tx - 3, y + level + 4, tz - 2, 4, 4, 1, 0);
        fill(tx - 3, y + level + 7, tz + 1, 4, 1, 1, 0);
        for (let n = 0; n < 4; n++) {
          put(tx - 3 + n, y + level + n, tz - 2, 183);
          put(tx - n, y + level + 4 + n, tz + 1, 185);
        }
        fill(tx + 1, y + level + 3, tz - 2, 2, 1, 4, stone);
        fill(tx - 3, y + level + 7, tz + 2, 1, 1, 2, stone);
      }
      for (const level of [0, 8]) {
        fill(tx - Math.sign(tx) * 4, y + level, tz - 1, 1, 3, 3, 0);
        fill(tx - 1, y + level, tz - Math.sign(tz) * 4, 3, 3, 1, 0);
      }
      for (const side of [-1, 1])
        for (let n = -4; n <= 4; n += 2) {
          put(tx + n, y + 17, tz + side * 4, stone);
          put(tx + side * 4, y + 17, tz + n, stone);
        }
      for (const yy of [y + 3, y + 11]) {
        put(tx, yy, tz + Math.sign(tz) * 4, 10);
        put(tx, yy, tz + Math.sign(tz) * 3, 48);
      }
      fill(tx, y + 17, tz, 1, 5, 1, 5);
      fill(tx + 1, y + 19, tz, 3, 3, 1, castle.kind === "ruined" ? 32 : 31);
    }
  // Three usable storeys: great hall, library/quarters and the guarded treasury.
  fill(-13, y - 1, -21, 27, 1, 27, stone);
  shell(-13, y, -21, 27, 19, 27, stone);
  for (const level of [6, 12, 18]) fill(-12, y + level - 1, -20, 25, 1, 25, 8);
  for (const level of [0, 6, 12]) {
    fill(0, y + level, -19, 1, 5, 22, stone);
    for (const z of [-13, -3]) fill(0, y + level, z, 1, 3, 3, 0);
    for (const z of [-17, -9, 0])
      for (const side of [-1, 1]) {
        fill(side * 13, y + level + 2, z, 1, 2, 2, 10);
        put(side * 12, y + level + 3, z, 48);
      }
    for (const x of [-7, 7]) {
      fill(x, y + level + 2, 5, 2, 2, 1, 10);
      put(x, y + level + 3, 4, 48);
    }
    // A wide alternating staircase leaves a genuine headroom opening in each floor.
    const east = level !== 6;
    const lane = east ? -16 : -12;
    fill(-10, y + level + 3, lane, 6, 3, 3, 0);
    for (let n = 0; n < 6; n++)
      fill(east ? -10 + n : -5 - n, y + level + n, lane, 1, 1, 3, east ? 183 : 185);
    fill(east ? -4 : -11, y + level + 5, -16, 1, 1, 7, 8);
  }
  fill(-2, y, 4, 5, 4, 3, 0);
  fill(-2, y - 1, 5, 5, 1, 4, 11);
  for (let n = -13; n <= 13; n += 3) {
    fill(n, y + 19, -21, 2, 1, 1, stone);
    fill(n, y + 19, 5, 2, 1, 1, stone);
    fill(-13, y + 19, n - 8, 1, 1, 2, stone);
    fill(13, y + 19, n - 8, 1, 1, 2, stone);
  }
  // Heraldic banners and a tall lantern spire give the keep a distant silhouette.
  for (const x of [-10, 9]) {
    fill(x, y + 6, 6, 2, 5, 1, 31);
    fill(x, y + 8, 6, 2, 1, 1, 32);
  }
  fill(3, y + 18, -12, 7, 5, 7, stone);
  shell(3, y + 22, -12, 7, 3, 7, 10);
  put(6, y + 23, -9, 16);
  for (let h = 0; h < 4; h++) fill(2 + h, y + 25 + h, -13 + h, 9 - h * 2, 1, 9 - h * 2, 47);
  // Half-timbered armory and barracks leave the main courtyard traversable.
  for (const sx of [-25, 17]) {
    fill(sx, y - 1, -7, 9, 1, 17, 8);
    shell(sx, y, -7, 9, 5, 17, 8);
    for (const xx of [sx, sx + 8]) for (const zz of [-7, 1, 9]) fill(xx, y, zz, 1, 5, 1, 5);
    fill(sx + (sx < 0 ? 8 : 0), y, 1, 1, 3, 3, 0);
    for (let h = 0; h < 5; h++) fill(sx - 1 + h, y + 5 + h, -8, 11 - h * 2, 1, 19, 47);
    put(sx + 4, y + 3, 0, 48);
    put(sx + 3, y, -5, 28);
    put(sx + 5, y, -5, 29);
    for (const x of [sx + 2, sx + 5]) {
      put(x, y, 6, 190);
      put(x, y, 5, 194);
    }
  }
  for (let x = 3; x < 11; x++) {
    put(x, y, -12, 8);
    put(x, y, -8, 8);
  }
  for (let z = -18; z < -3; z += 2) {
    put(11, y + 6, z, 30);
    put(11, y + 7, z, 30);
  }
  fill(5, y + 12, -19, 5, 1, 2, 31);
  for (const x of [-20, 20]) {
    fill(x, y, 20, 1, 4, 1, 5);
    put(x, y + 4, 20, 48);
  }
  // Broken crowns and irregular breaches keep ruins distinct; stair routes and loot floors survive.
  if (castle.kind === "ruined") {
    for (let xx = Math.max(ox, cx - 34); xx < Math.min(ox + 16, cx + 35); xx++)
      for (let zz = Math.max(oz, cz - 34); zz < Math.min(oz + 16, cz + 35); zz++) {
        const r = random(xx, zz, seed + 733),
          brokenTower = xx > cx + 24 && zz < cz - 24;
        for (let yy = y + 4; yy < Math.min(maxY, y + 29); yy++) {
          const index = xx - ox + (zz - oz) * 16 + yy * 256,
            id = chunk.data[index];
          if (
            [8, 9, 40, 47, 10].includes(id) &&
            (brokenTower ? yy > y + 10 : r > 0.84 && yy > y + 8) &&
            ![y + 5, y + 7, y + 11, y + 15, y + 17].includes(yy)
          )
            chunk.data[index] = 0;
        }
        if (r > 0.97 && Math.abs(xx - cx) > 8 && zz > cz + 13 && zz < cz + 25)
          put(xx - cx, y, zz - cz, 40);
      }
  }
  for (const entry of castle.loot) put(entry.p[0] - cx, entry.p[1], entry.p[2] - cz, 61);
}
