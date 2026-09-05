import { BLOCKS } from "./blocks";
import {
  CARDINAL,
  SHAPES,
  facingFromYaw,
  intersectsBlock,
  pointInside,
  type BlockBox,
  type V3,
} from "./block-shapes";

type BedWorld = {
  get(x: number, y: number, z: number): number;
  set(x: number, y: number, z: number, id: number): void;
  chunk?(x: number, z: number): unknown;
};
export function bedPartner(id: number, x: number, y: number, z: number) {
  const shape = SHAPES[id];
  if (!shape || shape.kind !== "bed" || id === 62) return null;
  const [dx, , dz] = CARDINAL[shape.facing],
    sign = shape.head ? -1 : 1;
  return { x: x + dx * sign, y, z: z + dz * sign, id: (shape.head ? 190 : 194) + shape.facing };
}
/** Validate both cells before writing either half. Saves and network edits retain their ordinary block IDs. */
export function placeBed(
  world: BedWorld,
  foot: V3,
  yaw: number,
  occupied: readonly BlockBox[] = [],
) {
  if (!foot.every(Number.isInteger) || !Number.isFinite(yaw) || foot[1] < 1 || foot[1] > 70)
    return false;
  const facing = facingFromYaw(yaw),
    [dx, , dz] = CARDINAL[facing];
  const parts = [
    { x: foot[0], y: foot[1], z: foot[2], id: 190 + facing },
    { x: foot[0] + dx, y: foot[1], z: foot[2] + dz, id: 194 + facing },
  ];
  for (const p of parts) world.chunk?.(Math.floor(p.x / 16), Math.floor(p.z / 16));
  for (const p of parts) {
    const previous = world.get(p.x, p.y, p.z),
      below = world.get(p.x, p.y - 1, p.z);
    if (previous && !BLOCKS[previous]?.plant) return false;
    if (
      !BLOCKS[below]?.solid ||
      ![
        [0.1, 0.1],
        [0.9, 0.1],
        [0.1, 0.9],
        [0.9, 0.9],
      ].every(([x, z]) => pointInside(below, x, 0.999, z))
    )
      return false;
    if (occupied.some((a) => intersectsBlock(p.id, p.x, p.y, p.z, a))) return false;
  }
  for (const p of parts) world.set(p.x, p.y, p.z, p.id);
  return true;
}
