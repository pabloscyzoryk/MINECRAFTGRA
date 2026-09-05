import { boxList, playerBox, worldBoxCollision, type BlockGetter } from "./block-shapes";

export const SHORE_JUMP_SPEED = 6.8;
type Position = { x: number; y: number; z: number };

/** A stroke against a low bank adds momentum; normal swept physics still moves the player. */
export function canJumpOntoBank(
  from: Position,
  to: Position,
  height: number,
  get: BlockGetter,
  solid: (id: number) => boolean,
  waterAt: (x: number, y: number, z: number) => boolean,
): boolean {
  if (!waterAt(from.x, from.y + 0.55, from.z) || waterAt(from.x, from.y + 0.9, from.z))
    return false;
  for (let x = Math.floor(to.x - 0.29); x <= Math.floor(to.x + 0.29); x++)
    for (let z = Math.floor(to.z - 0.29); z <= Math.floor(to.z + 0.29); z++)
      for (let y = Math.floor(from.y); y <= Math.floor(from.y + 1.05); y++) {
        const id = get(x, y, z);
        if (!solid(id)) continue;
        for (const box of boxList(id)) {
          const top = y + box[4];
          if (
            top <= from.y ||
            top > from.y + 1.05 ||
            to.x + 0.29 <= x + box[0] ||
            to.x - 0.29 >= x + box[3] ||
            to.z + 0.29 <= z + box[2] ||
            to.z - 0.29 >= z + box[5]
          )
            continue;
          // A tall wall or a roof cannot become a ladder. Test the complete upward volume.
          if (
            !worldBoxCollision(playerBox(from, height + top - from.y), get, solid) &&
            !worldBoxCollision(playerBox({ ...to, y: top }, height), get, solid)
          )
            return true;
        }
      }
  return false;
}
