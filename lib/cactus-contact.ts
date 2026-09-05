import type { BlockBox, BlockGetter } from "./block-shapes";

// The core is inset, but the visible thorns reach the six faces of the voxel.
// A tiny collision tolerance includes standing on its top without creating a damage radius.
export const CACTUS_CONTACT_EPSILON = 0.01;
export function touchesCactus(get: BlockGetter, a: BlockBox): boolean {
  if (!a.every(Number.isFinite) || a.slice(0, 3).some((n, axis) => n > a[axis + 3])) return false;
  const e = CACTUS_CONTACT_EPSILON;
  for (let x = Math.floor(a[0] - e); x <= Math.floor(a[3] + e); x++)
    for (let y = Math.floor(a[1] - e); y <= Math.floor(a[4] + e); y++)
      for (let z = Math.floor(a[2] - e); z <= Math.floor(a[5] + e); z++) {
        if (get(x, y, z) !== 41) continue;
        if (
          a[3] >= x - e &&
          a[0] <= x + 1 + e &&
          a[4] >= y - e &&
          a[1] <= y + 1 + e &&
          a[5] >= z - e &&
          a[2] <= z + 1 + e
        )
          return true;
      }
  return false;
}
