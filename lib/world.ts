import { biomeSample, region } from "./biomes";
import { castleSites, describeCastle, generateCastleChunk, type CastleDescriptor } from "./castles";
import { BLOCKS, type Dimension } from "./blocks";
import { pointInside, boxList } from "./block-shapes";
import { bedPartner } from "./bed";
export const SIZE = 16,
  HEIGHT = 72,
  WATER = 12;
export function hash(x: number, z: number, seed = 42) {
  let n = Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed, 144269);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
const smooth = (a: number) => a * a * (3 - 2 * a);
export function noise(x: number, z: number, seed: number) {
  const ix = Math.floor(x),
    iz = Math.floor(z),
    fx = smooth(x - ix),
    fz = smooth(z - iz);
  return (
    (hash(ix, iz, seed) * (1 - fx) + hash(ix + 1, iz, seed) * fx) * (1 - fz) +
    (hash(ix, iz + 1, seed) * (1 - fx) + hash(ix + 1, iz + 1, seed) * fx) * fz
  );
}
export type Chunk = {
  cx: number;
  cz: number;
  data: Uint8Array;
  dirty: boolean;
};
export class World {
  chunks = new Map<string, Chunk>();
  edits: Record<string, number> = {};
  waterLevels: Record<string, number> = {};
  onEdit?: (x: number, y: number, z: number) => void;
  dimension: Dimension = "overworld";
  seed = 24680;
  private castleCache = new Map<string, CastleDescriptor>();
  constructor(seed = 24680) {
    this.seed = seed;
  }
  biomeInfo(x: number, z: number) {
    return biomeSample(x, z, this.seed).biome;
  }
  castlesNearby(x: number, z: number, radius = 96): CastleDescriptor[] {
    if (this.dimension !== "overworld") return [];
    return castleSites(this.seed, x, z, radius).map((site) => {
      const key = this.seed + ":" + site.id;
      let castle = this.castleCache.get(key);
      if (!castle) {
        castle = describeCastle(site, (x, z) => this.height(x, z));
        if (this.castleCache.size >= 256)
          this.castleCache.delete(this.castleCache.keys().next().value!);
        this.castleCache.set(key, castle);
      }
      return castle;
    });
  }
  biome(x: number, z: number) {
    if (this.dimension === "nether") return "Pustkowia Netheru";
    if (this.dimension === "end") return "Wyspy Endu";
    return this.biomeInfo(x, z).name;
  }
  caveType(x: number, z: number) {
    const n = noise(x / 47, z / 47, this.seed + 71);
    return n < 0.34 ? "Kryształowe groty" : n > 0.62 ? "Bujne jaskinie" : "Jaskinie naciekowe";
  }
  biomeAt(x: number, y: number, z: number) {
    if (this.dimension === "overworld") {
      const castle = this.castlesNearby(x,z,0).find(c => x >= c.bounds.minX && x <= c.bounds.maxX && z >= c.bounds.minZ && z <= c.bounds.maxZ && y >= c.y - 1);
      if (castle) return castle.name;
    }
    return this.dimension === "overworld" && y < this.height(x, z) - 5
      ? this.caveType(x, z)
      : this.biome(x, z);
  }
  height(x: number, z: number) {
    if (this.dimension === "end") {
      const d = Math.hypot(x, z);
      return d < 51
        ? Math.round(16 + noise(x / 18, z / 18, this.seed) * 4 - Math.max(0, d - 34) * 0.55)
        : d > 66 && noise(x / 22, z / 22, this.seed) > 0.64
          ? 14
          : 0;
    }
    if (this.dimension === "nether")
      return Math.round(
        10 + noise(x / 23, z / 23, this.seed) * 11 + noise(x / 7, z / 7, this.seed + 4) * 3,
      );
    const broad = noise(x / 52, z / 52, this.seed),
      detail = noise(x / 12, z / 12, this.seed + 12),
      sample = biomeSample(x, z, this.seed),
      biome = sample.biome;
    let special = biome.base + broad * biome.amplitude + detail * 3;
    if (biome.id === "desert") special += Math.sin(x * 0.13 + z * 0.035) * 2;
    if (biome.id === "badlands") special = Math.floor(special / 3) * 3;
    if (biome.id === "snow") special += Math.max(0, broad - 0.5) * 20;
    let h = (14 + broad * 8) * (1 - sample.blend) + special * sample.blend;
    const river = Math.abs(Math.sin(x * 0.022 + Math.sin(z * 0.022) * 1.4));
    if (river < 0.14 && Math.hypot(x, z) > 30 && biome.id !== "snow")
      h = Math.min(h, 9 + (river / 0.14) * 6);
    if (Math.abs(x) < 26 && Math.abs(z) < 26) h = 15 + detail * 2;
    return Math.max(4, Math.min(58, Math.floor(h)));
  }

  chunk(cx: number, cz: number) {
    const k = cx + "," + cz;
    let c = this.chunks.get(k);
    if (!c) {
      c = { cx, cz, data: new Uint8Array(SIZE * SIZE * HEIGHT), dirty: true };
      this.chunks.set(k, c);
      this.generate(c);
    }
    return c;
  }
  raw(c: Chunk, x: number, y: number, z: number, id: number) {
    if (x >= 0 && x < 16 && z >= 0 && z < 16 && y >= 0 && y < HEIGHT)
      c.data[x + z * 16 + y * 256] = id;
  }
  generate(c: Chunk) {
    const ox = c.cx * 16,
      oz = c.cz * 16;
    for (let x = 0; x < 16; x++)
      for (let z = 0; z < 16; z++) {
        const wx = ox + x,
          wz = oz + z,
          h = this.height(wx, wz),
          biome = this.biomeInfo(wx, wz);
        for (let y = 0; y <= Math.max(h, this.dimension === "overworld" ? WATER : 8); y++) {
          let id = 0;
          if (y === 0) id = 35;
          else if (y > h)
            id = this.dimension === "overworld" ? 7 : this.dimension === "nether" ? 15 : 0;
          else if (this.dimension === "end") id = 17;
          else if (this.dimension === "nether") {
            id = y === h && hash(wx, wz, this.seed) > 0.91 ? 15 : 14;
            if (id === 14 && y < h - 1) {
              const ore = hash(wx + y * 57, wz - y * 91, this.seed + 733);
              if (y < 12 && ore > 0.9985) id = 92;
              else if (ore > 0.965) id = 91;
              else if (ore > 0.944) id = 93;
            }
          } else if (y === h) id = h < WATER && biome.id !== "swamp" ? 4 : biome.surface;
          else if (y > h - 4)
            id =
              biome.id === "desert"
                ? 4
                : biome.id === "badlands"
                  ? [56, 57, 58][y % 3]
                  : biome.id === "swamp"
                    ? 54
                    : 2;
          else {
            const r = hash(wx + y * 57, wz - y * 91, this.seed);
            id = y < 5 ? 82 : biome.id === "badlands" && y > 10 ? [56, 56, 57, 58, 56][y % 5] : 3;
            if (r > 0.97) id = 20;
            else if (r > 0.947) id = 21;
            else if (r > 0.937) id = 80;
            else if (r > 0.929 && y < 11) id = 22;
            else if (r > 0.916 && r <= 0.929 && (y < 16 || biome.id === "badlands")) id = 87;
            else if (r > 0.902 && r <= 0.916 && y < 12) id = 88;
            else if (r > 0.894 && r <= 0.902 && y < 20) id = 89;
            else if (r > 0.89 && r <= 0.894 && y > 6) id = 90;
            if (
              y > 2 &&
              y < h - 4 &&
              noise(wx / 10 + y * 0.14, wz / 10 - y * 0.14, this.seed + 3) > 0.69
            )
              id = 0;
          }
          if (
            this.dimension === "overworld" &&
            id === 2 &&
            h <= 14 &&
            hash(wx + y, wz, this.seed + 94) > 0.55
          )
            id = 42;
          this.raw(c, x, y, z, id);
        }
        if (this.dimension === "nether" && hash(wx, wz, this.seed) > 0.986) {
          for (let y = h + 1; y < h + 6; y++) this.raw(c, x, y, z, 35);
          this.raw(c, x, h + 6, z, 16);
        }
        if (this.dimension === "overworld") {
          const random = hash(wx, wz, this.seed + 18);
          if (biome.id === "snow" && random > 0.995) {
            for (let y = h + 1; y < h + 9; y++) this.raw(c, x, y, z, 60);
          }
          if (h < WATER - 1 && biome.id === "ocean" && random > 0.88) this.raw(c, x, h + 1, z, 74);
          if (h >= WATER && Math.hypot(wx, wz) > 27 && biome.flower && random > 0.88) {
            const flower =
              biome.id === "flower"
                ? [67, 68, 69, 70][Math.floor(hash(wx, wz, 17) * 4) % 4]
                : biome.flower;
            this.raw(c, x, h + 1, z, flower);
            if (flower === 59) for (let y = h + 2; y < h + 5; y++) this.raw(c, x, y, z, 59);
          }
          if (
            (h > WATER || biome.id === "swamp") &&
            Math.hypot(wx, wz) > 28 &&
            x > 2 &&
            x < 13 &&
            z > 2 &&
            z < 13 &&
            hash(wx, wz, this.seed) > 1 - biome.trees
          ) {
            if (!biome.trunk) {
              for (let y = 1; y < 4; y++) this.raw(c, x, h + y, z, 41);
            } else {
              const th =
                biome.id === "jungle" ? 9 : biome.id === "taiga" ? 8 : biome.id === "swamp" ? 7 : 5;
              for (let y = 1; y <= th; y++) this.raw(c, x, h + y, z, biome.trunk);
              if (biome.id === "swamp")
                for (const [dx, dz] of [
                  [1, 0],
                  [-1, 0],
                  [0, 1],
                  [0, -1],
                ])
                  for (let y = 0; y < 3; y++) this.raw(c, x + dx, h + y, z + dz, 52);
              for (let y = th - 2; y <= th + 1; y++) {
                const rad = y === th + 1 ? 1 : 2;
                for (let dx = -rad; dx <= rad; dx++)
                  for (let dz = -rad; dz <= rad; dz++)
                    if (Math.abs(dx) + Math.abs(dz) < rad * 2 + 1 && (dx || dz || y > th))
                      this.raw(c, x + dx, h + y, z + dz, biome.leaves);
              }
              if (biome.id === "cherry") {
                for (let dx = -2; dx <= 2; dx++) this.raw(c, x + dx, h + th - 2, z, 50);
              }
            }
          }
          for (let y = 3; y < h - 4; y++) {
            const index = x + z * 16 + y * 256;
            if (c.data[index] !== 0) continue;
            const r = hash(wx + y * 13, wz, this.seed + 65),
              kind = this.caveType(wx, wz);
            if (c.data[index - 256] && r > 0.94) {
              if (kind === "Bujne jaskinie") {
                c.data[index - 256] = 71;
                this.raw(c, x, y, z, 72);
              } else this.raw(c, x, y, z, kind === "Kryształowe groty" ? 73 : 75);
            }
            if (c.data[index + 256] && r > 0.96)
              this.raw(
                c,
                x,
                y,
                z,
                kind === "Bujne jaskinie" ? 16 : kind === "Kryształowe groty" ? 73 : 75,
              );
          }
        }
      }
    this.structures(c);
    this.landmarks(c);
    for (const castle of this.castlesNearby(ox + 7.5, oz + 7.5, 8))
      generateCastleChunk(castle, c, this.seed);
    const prefix = this.dimension + ":";
    for (const [key, id] of Object.entries(this.edits)) {
      if (!key.startsWith(prefix)) continue;
      const [x, y, z] = key.slice(prefix.length).split(",").map(Number);
      if (Math.floor(x / 16) === c.cx && Math.floor(z / 16) === c.cz)
        this.raw(c, x - ox, y, z - oz, id);
    }
  }
  landmarks(c: Chunk) {
    if (this.dimension !== "overworld") return;
    const put = (x: number, y: number, z: number, id: number) =>
        this.raw(c, x - c.cx * 16, y, z - c.cz * 16, id),
      box = (x: number, y: number, z: number, w: number, h: number, d: number, id: number) => {
        for (let a = 0; a < w; a++)
          for (let b = 0; b < h; b++) for (let e = 0; e < d; e++) put(x + a, y + b, z + e, id);
      };
    const rcx = Math.round((c.cx * 16) / 96),
      rcz = Math.round((c.cz * 16) / 96);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        const cx = rcx + dx,
          cz = rcz + dz;
        if (cx === 0 && cz === 0) continue;
        const r = region(cx, cz, this.seed),
          x = r.x,
          z = r.z,
          b = r.biome;
        if (x < c.cx * 16 - 16 || x > c.cx * 16 + 32 || z < c.cz * 16 - 16 || z > c.cz * 16 + 32)
          continue;
        const y = this.height(x, z) + 1;
        if (b.id === "desert" || b.id === "jungle") {
          const stone = b.id === "desert" ? 27 : 40;
          for (let h = 0; h < 6; h++)
            box(x - 7 + h, y + h, z - 7 + h, 15 - h * 2, 1, 15 - h * 2, stone);
          box(x - 3, y, z - 3, 7, 3, 7, 0);
          box(x - 1, y, z + 3, 3, 2, 5, 0);
          put(x, y, z, 61);
          for (const a of [-4, 4]) {
            box(x + a, y, z + 6, 1, 4, 1, 83);
            put(x + a, y + 4, z + 6, 48);
          }
          put(x, y + 4, z, 84);
        } else if (b.id === "swamp" || b.id === "birch" || b.id === "taiga" || b.id === "cherry") {
          const plank = b.id === "swamp" ? 86 : b.id === "cherry" ? 51 : 8,
            base = b.id === "swamp" ? Math.max(16, y + 3) : y;
          for (const a of [-3, 3])
            for (const e of [-3, 3]) box(x + a, y - 3, z + e, 1, base - y + 7, 1, b.trunk || 5);
          box(x - 3, base, z - 3, 7, 1, 7, plank);
          box(x - 3, base + 1, z - 3, 7, 3, 7, plank);
          box(x - 2, base + 1, z - 2, 5, 3, 5, 0);
          box(x, base + 1, z + 3, 1, 2, 1, 0);
          for (let a = 0; a < 3; a++) box(x - 4 + a, base + 4 + a, z - 4, 9 - a * 2, 1, 9, 47);
          put(x - 2, base + 1, z - 2, 61);
          put(x + 1, base + 1, z - 1, 190);
          put(x + 1, base + 1, z - 2, 194);
          put(x, base + 3, z, 48);
          for (let i = 0; i < 5; i++) box(x - 1, base - i, z + 4 + i, 3, 1, 1, 9);
        } else if (b.id === "mushroom" || b.id === "crystal") {
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2,
              px = x + Math.round(Math.cos(a) * 5),
              pz = z + Math.round(Math.sin(a) * 5);
            box(px, y, pz, 1, 3 + (i % 3), 1, b.id === "crystal" ? 73 : 40);
            put(px, y + 3 + (i % 3), pz, 84);
          }
          box(x - 2, y - 1, z - 2, 5, 1, 5, 82);
          put(x, y, z, 61);
          put(x, y + 1, z, 84);
        } else if (b.id === "badlands") {
          box(x - 3, y - 3, z - 3, 7, 5, 9, 0);
          box(x - 4, y - 4, z - 4, 9, 1, 10, 8);
          for (const a of [-3, 3]) for (const e of [-3, 0, 3]) box(x + a, y - 3, z + e, 1, 5, 1, 5);
          for (const e of [-3, 0, 3]) box(x - 3, y + 1, z + e, 7, 1, 1, 5);
          put(x, y - 3, z - 2, 61);
          put(x + 2, y - 3, z - 2, 22);
          put(x - 2, y - 3, z - 2, 80);
          put(x, y + 1, z, 48);
        } else {
          const stone = b.id === "ocean" ? 85 : b.id === "snow" ? 60 : 40,
            base = b.id === "ocean" ? 13 : y;
          box(x - 3, base - 1, z - 3, 7, 1, 7, 9);
          for (let h = 0; h < 11; h++)
            for (let a = -2; a <= 2; a++)
              for (let e = -2; e <= 2; e++)
                if (a === -2 || a === 2 || e === -2 || e === 2) put(x + a, base + h, z + e, stone);
          box(x - 1, base, z + 2, 2, 3, 1, 0);
          box(x - 3, base + 10, z - 3, 7, 1, 7, 8);
          box(x - 1, base + 11, z - 1, 3, 2, 3, 10);
          put(x, base + 12, z, 16);
          box(x - 2, base + 13, z - 2, 5, 1, 5, 47);
          put(x, base, z, 61);
        }
      }
  }
  ruinLocation() {
    // Beside the starting village, clear of houses, crops and the End gateway.
    const x = -18,
      z = 12;
    return { x, z, y: this.height(x, z) + 1 };
  }
  structures(c: Chunk) {
    const put = (x: number, y: number, z: number, id: number) =>
      this.raw(c, x - c.cx * 16, y, z - c.cz * 16, id);
    const box = (x: number, y: number, z: number, w: number, h: number, d: number, id: number) => {
      for (let a = 0; a < w; a++)
        for (let b = 0; b < h; b++) for (let e = 0; e < d; e++) put(x + a, y + b, z + e, id);
    };
    if (this.dimension === "overworld") {
      for (const [hx, hz] of [
        [-7, -2],
        [7, -8],
        [-10, -17],
      ]) {
        const y = this.height(hx, hz);
        box(hx - 1, y - 2, hz - 1, 9, 3, 9, 9);
        box(hx, y + 1, hz, 7, 4, 7, 8);
        box(hx + 1, y + 1, hz + 1, 5, 3, 5, 0);
        box(hx + 3, y + 1, hz + 6, 1, 2, 1, 0);
        for (const z of [hz + 2, hz + 4]) {
          put(hx, y + 2, z, 10);
          put(hx + 6, y + 2, z, 10);
        }
        for (let a = 0; a < 4; a++) box(hx - 1 + a, y + 5 + a, hz - 1, 9 - a * 2, 1, 9, 47);
        put(hx + 1, y + 1, hz + 1, 28);
        put(hx + 2, y + 1, hz + 1, 29);
        put(hx + 4, y + 1, hz + 1, 30);
        put(hx + 3, y + 3, hz + 3, 48);
        put(hx + 1, y + 1, hz + 4, 61);
        put(hx + 4, y + 1, hz + 3, 190);
        put(hx + 4, y + 1, hz + 2, 194);
      }
      const wellY = this.height(4, 4);
      box(2, wellY, 2, 5, 1, 5, 40);
      box(3, wellY, 3, 3, 1, 3, 7);
      for (const x of [2, 6]) for (const z of [2, 6]) box(x, wellY + 1, z, 1, 3, 1, 5);
      box(1, wellY + 4, 1, 7, 1, 7, 8);
      const fy = this.height(13, 4);
      for (let x = 10; x <= 17; x++)
        for (let z = 1; z <= 7; z++) {
          put(x, fy, z, x === 13 ? 7 : 63);
          if (x !== 13) put(x, fy + 1, z, 66);
        }
      const ruin = this.ruinLocation();
      if (Math.abs(c.cx * 16 - ruin.x) < 32 && Math.abs(c.cz * 16 - ruin.z) < 32) {
        box(ruin.x - 2, ruin.y - 1, ruin.z - 2, 8, 1, 6, 40);
        for (let a = 0; a < 4; a++)
          for (let b = 0; b < 5; b++)
            if (a === 0 || a === 3 || b === 0 || b === 4) {
              if (!((a === 0 && b === 2) || (a === 3 && b === 3) || (a === 1 && b === 4)))
                put(ruin.x + a, ruin.y + b, ruin.z, 12);
            } else put(ruin.x + a, ruin.y + b, ruin.z, 0);
        put(ruin.x - 1, ruin.y, ruin.z + 2, 61);
        put(ruin.x + 5, ruin.y, ruin.z, 14);
        put(ruin.x + 4, ruin.y, ruin.z + 1, 12);
      }
      this.portal(put, 20, -15, 18);
      // A ruined watchtower beyond the village.
      const tx = 34,
        tz = -33,
        ty = this.height(tx, tz);
      for (let h = 0; h < 12; h++)
        for (let x = 0; x < 6; x++)
          for (let z = 0; z < 6; z++)
            if (x === 0 || z === 0 || x === 5 || z === 5)
              if (h < 8 || hash(x + h, z, 4) > 0.35) put(tx + x, ty + h, tz + z, 40);
      box(tx + 2, ty + 1, tz + 5, 2, 3, 1, 0);
      put(tx + 2, ty + 1, tz + 2, 61);
    } else if (this.dimension === "nether") {
      this.portal(put, 0, 5, 13);
      const y = 25;
      box(-16, y, -20, 32, 2, 7, 38);
      for (const x of [-16, -8, 0, 8, 15]) {
        box(x, 8, -20, 2, 17, 2, 38);
        box(x, y + 2, -20, 1, 2, 1, 38);
        put(x, y + 3, -19, 16);
      }
      for (const x of [-16, 10]) {
        box(x, y, -27, 6, 10, 6, 38);
        box(x + 1, y + 2, -26, 4, 6, 4, 0);
        box(x + 2, y + 2, -22, 2, 3, 2, 0);
      }
      put(-14, 27, -25, 61);
      put(12, 27, -25, 61);
      this.portal(put, 17, 6, 18);
    } else {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2,
          x = Math.round(Math.cos(a) * 29),
          z = Math.round(Math.sin(a) * 29),
          h = 13 + (i % 3) * 4;
        box(x - 1, 17, z - 1, 3, h, 3, 12);
      }
      box(-3, 18, -3, 7, 1, 7, 35);
      for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) put(x, 19, z, 18);
    }
  }
  portal(
    put: (x: number, y: number, z: number, id: number) => void,
    x: number,
    z: number,
    id: number,
  ) {
    const y = this.height(x, z) + 1;
    for (let a = -2; a <= 2; a++)
      for (let b = 0; b < 6; b++)
        put(x + a, y + b, z, a === -2 || a === 2 || b === 0 || b === 5 ? 12 : id);
    for (let a = -3; a <= 3; a++) for (let b = -2; b <= 2; b++) put(x + a, y - 1, z + b, 9);
  }
  get(x: number, y: number, z: number) {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    if (y < 0) return 35;
    if (y >= HEIGHT) return 0;
    const c = this.chunks.get(Math.floor(x / 16) + "," + Math.floor(z / 16));
    if (!c) return 0;
    return c.data[(((x % 16) + 16) % 16) + (((z % 16) + 16) % 16) * 16 + y * 256];
  }
  set(x: number, y: number, z: number, id: number, flow = false) {
    if (y <= 0 || y >= HEIGHT) return;
    const c = this.chunk(Math.floor(x / 16), Math.floor(z / 16));
    const previous = this.get(x, y, z);
    const partner = previous !== id ? bedPartner(previous, x, y, z) : null;
    this.raw(c, ((x % 16) + 16) % 16, y, ((z % 16) + 16) % 16, id);
    this.edits[this.dimension + ":" + x + "," + y + "," + z] = id;
    if (!flow) delete this.waterLevels[this.dimension + ":" + x + "," + y + "," + z];
    this.onEdit?.(x, y, z);
    if (partner) {
      this.chunk(Math.floor(partner.x / 16), Math.floor(partner.z / 16));
      if (this.get(partner.x, partner.y, partner.z) === partner.id)
        this.set(partner.x, partner.y, partner.z, 0, flow);
    }
    c.dirty = true;
    for (const [dx, dz] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const n = this.chunks.get(c.cx + dx + "," + (c.cz + dz));
      if (n) n.dirty = true;
    }
  }
  waterAt(x: number, y: number, z: number) {
    if (this.get(x, y, z) !== 7) return false;
    const iy = Math.floor(y),
      key = this.dimension + ":" + Math.floor(x) + "," + iy + "," + Math.floor(z),
      level = this.waterLevels[key] ?? 0;
    const height = this.get(x, iy + 1, z) === 7 || level === 8 ? 1 : 0.88 - level * 0.095;
    return y - iy < height;
  }
  /** All current lava blocks are sources: water touching their top or sides forms obsidian. */
  coolLava(x: number, y: number, z: number) {
    if (this.get(x, y, z) !== 15) return false;
    for (const [dx, dy, dz] of [
      [0, 1, 0],
      [1, 0, 0],
      [-1, 0, 0],
      [0, 0, 1],
      [0, 0, -1],
    ])
      if (this.get(x + dx, y + dy, z + dz) === 7) {
        this.set(x, y, z, 12);
        return true;
      }
    return false;
  }
  /** A bucket aimed directly at lava pours onto its exposed surface instead of deleting the lava. */
  pourWater(x: number, y: number, z: number) {
    if (
      ![x, y, z].every(Number.isInteger) ||
      y < 1 ||
      y >= HEIGHT - 1 ||
      this.dimension === "nether"
    )
      return false;
    while (this.get(x, y, z) === 15 && y < HEIGHT - 1) y++;
    const existing = this.get(x, y, z);
    if (y >= HEIGHT - 1 || (existing !== 0 && existing !== 7 && !BLOCKS[existing]?.plant))
      return false;
    this.set(x, y, z, 7);
    for (const [dx, dy, dz] of [
      [0, -1, 0],
      [1, 0, 0],
      [-1, 0, 0],
      [0, 0, 1],
      [0, 0, -1],
    ])
      this.coolLava(x + dx, y + dy, z + dz);
    return true;
  }
  solid(x: number, y: number, z: number) {
    const id = this.get(x, y, z);
    return (
      !!BLOCKS[id]?.solid &&
      pointInside(id, x - Math.floor(x), y - Math.floor(y), z - Math.floor(z))
    );
  }
  surface(x: number, z: number) {
    this.chunk(Math.floor(x / 16), Math.floor(z / 16));
    const fx = Number.isInteger(x) ? 0.5 : x - Math.floor(x),
      fz = Number.isInteger(z) ? 0.5 : z - Math.floor(z);
    for (let y = HEIGHT - 2; y >= 0; y--) {
      const id = this.get(x, y, z);
      if (!BLOCKS[id]?.solid) continue;
      const tops = boxList(id)
        .filter((b) => fx >= b[0] && fx <= b[3] && fz >= b[2] && fz <= b[5])
        .map((b) => b[4]);
      if (tops.length) return y + Math.max(...tops);
    }
    return 1;
  }
  switch(d: Dimension) {
    this.dimension = d;
    this.chunks.clear();
  }
}
