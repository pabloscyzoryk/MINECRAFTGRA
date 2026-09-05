import { BLOCKS } from "./blocks";
import { SHAPES, boxList, playerBox, worldBoxCollision, type V3 } from "./block-shapes";
import { touchesCactus } from "./cactus-contact";

export type SpawnWorld = {
  get(x: number, y: number, z: number): number;
  chunk?(x: number, z: number): unknown;
  surface(x: number, z: number): number;
};
type StandingWorld = Pick<SpawnWorld, "get" | "chunk">;
const solid = (id: number) => !!BLOCKS[id]?.solid;
const hazardous = (id: number) => id === 7 || id === 15 || id === 13 || id === 18;

/** Full standing body, safe support and thorn clearance, shared by bed exits and spawn. */
export function isSafeStandingPosition(world: StandingWorld, p: V3): boolean {
  if (!p.every(Number.isFinite) || p[1] < 1 || p[1] > 72) return false;
  const a = playerBox({ x: p[0], y: p[1], z: p[2] }, 1.75);
  for (let x = Math.floor((a[0] - 0.01) / 16); x <= Math.floor((a[3] + 0.01) / 16); x++)
    for (let z = Math.floor((a[2] - 0.01) / 16); z <= Math.floor((a[5] + 0.01) / 16); z++)
      world.chunk?.(x, z);
  const get = (x: number, y: number, z: number) => world.get(x, y, z);
  if (worldBoxCollision(a, get, solid) || touchesCactus(get, a)) return false;
  // Include the immediate space under the feet: a liquid surface is not safe footing.
  for (let x = Math.floor(a[0]); x <= Math.floor(a[3]); x++)
    for (let y = Math.floor(a[1] - 0.002); y <= Math.floor(a[4]); y++)
      for (let z = Math.floor(a[2]); z <= Math.floor(a[5]); z++)
        if (hazardous(get(x, y, z))) return false;
  return worldBoxCollision(
    playerBox({ x: p[0], y: p[1] - 0.002, z: p[2] }, 0.003),
    get,
    (id) => solid(id) && id !== 41 && SHAPES[id]?.kind !== "bed",
  );
}

const SPAWN_OFFSETS = (() => {
  const offsets: { x: number; z: number; distance: number }[] = [];
  for (let x = -32; x <= 32; x++)
    for (let z = -32; z <= 32; z++) offsets.push({ x, z, distance: x * x + z * z });
  return offsets.sort((a, b) => a.distance - b.distance || a.x - b.x || a.z - b.z);
})();

/** Searches nearby existing terrain; never clears blocks, fills liquids or manufactures a platform. */
export function findSafeWorldSpawn(world: SpawnWorld, originX = 8.5, originZ = 22.5): V3 | null {
  if (![originX, originZ].every(Number.isFinite)) return null;
  for (const offset of SPAWN_OFFSETS) {
    const x = originX + offset.x,
      z = originZ + offset.z;
    world.chunk?.(Math.floor(x / 16), Math.floor(z / 16));
    const surface = world.surface(x, z);
    const first: V3 = [x, surface, z];
    if (isSafeStandingPosition(world, first)) return first;
    // A hazardous roof can still have a clear, supported room beneath it.
    for (let y = Math.min(71, Math.floor(surface)); y >= 0; y--) {
      const id = world.get(Math.floor(x), y, Math.floor(z));
      if (!solid(id) || id === 41 || SHAPES[id]?.kind === "bed") continue;
      for (const b of boxList(id)) {
        if (
          x - Math.floor(x) < b[0] ||
          x - Math.floor(x) > b[3] ||
          z - Math.floor(z) < b[2] ||
          z - Math.floor(z) > b[5]
        )
          continue;
        const candidate: V3 = [x, y + b[4], z];
        if (candidate[1] !== surface && isSafeStandingPosition(world, candidate)) return candidate;
      }
    }
  }
  return null;
}
