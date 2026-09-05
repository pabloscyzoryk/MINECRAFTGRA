import type { HorrorEvent } from "./horror-director";
import type { World } from "./world";

type Vec = [number, number, number];
/** The same finite footprint is used in solo play and in the authoritative room. */
export function placeHorrorEvent(
  event: HorrorEvent,
  anchor: Vec,
  underground: boolean,
  world: Pick<World, "solid" | "get" | "surface">,
  ensure: (x: number, z: number) => void = () => {},
) {
  const free = (x: number, y: number, z: number) => {
    if (y < 1 || y > 65 || !world.solid(x, y - 0.05, z)) return false;
    for (let height = 0; height <= 4; height++)
      for (const dx of [-0.8, 0, 0.8])
        for (const dz of [-0.8, 0, 0.8])
          if (
            world.solid(x + dx, y + height, z + dz) ||
            [7, 15].includes(world.get(x + dx, y + height, z + dz))
          )
            return false;
    const dx = x - anchor[0],
      dy = y + 1.7 - (anchor[1] + 1.5),
      dz = z - anchor[2];
    const distance = Math.hypot(dx, dy, dz);
    for (let step = 0.15; step < distance; step += 0.15) {
      const fraction = step / distance;
      if (
        world.solid(
          anchor[0] + dx * fraction,
          anchor[1] + 1.5 + dy * fraction,
          anchor[2] + dz * fraction,
        )
      )
        return false;
    }
    return true;
  };
  for (const [dx, dz] of [
    [0, 0],
    [3, 0],
    [-3, 0],
    [0, 3],
    [0, -3],
    [5, 5],
    [-5, -5],
  ]) {
    const x = Math.floor(event.p[0] + dx) + 0.5,
      z = Math.floor(event.p[2] + dz) + 0.5;
    ensure(x, z);
    const heights = underground
      ? [0, -1, 1, -2, 2].map((dy) => Math.floor(anchor[1]) + dy)
      : [world.surface(x, z)];
    for (const y of heights)
      if (Math.abs(y - anchor[1]) < 9 && free(x, y, z)) {
        event.p = [x, y, z];
        event.yaw = Math.atan2(anchor[0] - x, anchor[2] - z);
        return true;
      }
  }
  // Audio may suggest a presence; terrain is never cut to force a visible apparition.
  event.kind = "knock";
  event.duration = 3;
  event.intensity = Math.min(0.45, event.intensity);
  event.reason = "obstructed";
  return false;
}
