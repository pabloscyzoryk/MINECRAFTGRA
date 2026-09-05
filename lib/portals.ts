import type { World } from "./world";
// Detect a repaired frame in either vertical plane. Corner blocks are optional.
export function ignitePortal(w: World, x: number, y: number, z: number) {
  if (w.dimension === "end") return false;
  for (const axis of ["x", "z"] as const)
    for (let dx = -3; dx <= 0; dx++)
      for (let dy = -4; dy <= 0; dy++) {
        const bx = x + (axis === "x" ? dx : 0),
          bz = z + (axis === "z" ? dx : 0),
          by = y + dy;
        const get = (a: number, b: number) =>
          w.get(bx + (axis === "x" ? a : 0), by + b, bz + (axis === "z" ? a : 0));
        let valid = by > 0;
        for (let a = 1; a <= 2; a++) if (get(a, 0) !== 12 || get(a, 4) !== 12) valid = false;
        for (let b = 1; b <= 3; b++) if (get(0, b) !== 12 || get(3, b) !== 12) valid = false;
        for (let a = 1; a <= 2; a++)
          for (let b = 1; b <= 3; b++) if (![0, 13].includes(get(a, b))) valid = false;
        if (valid) {
          for (let a = 1; a <= 2; a++)
            for (let b = 1; b <= 3; b++)
              w.set(bx + (axis === "x" ? a : 0), by + b, bz + (axis === "z" ? a : 0), 13);
          return true;
        }
      }
  return false;
}
