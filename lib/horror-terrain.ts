import type { Dimension } from "./blocks";
import type { HorrorEvent } from "./horror-director";
import type { HuntEnvironment } from "./horror-hunt";
import { placeHorrorEvent } from "./horror-placement";
import type { World } from "./world";

type Vec = [number, number, number];
type Terrain = Pick<World, "solid" | "get" | "surface">;

/** Both server and solo play use the same solid terrain for the Guest's body and attacks. */
export function createHuntEnvironment(
  worldFor: (dimension: Dimension) => Terrain,
  ensure: (dimension: Dimension, x: number, z: number) => void = () => {},
): HuntEnvironment {
  return {
    place(candidate, anchor, dimension) {
      const world = worldFor(dimension);
      const event = {
        kind: "watcher",
        p: [...candidate],
        duration: 5,
        intensity: 0.7,
      } as HorrorEvent;
      return placeHorrorEvent(
        event,
        anchor,
        world.surface(anchor[0], anchor[2]) - anchor[1] > 5,
        world,
        (x, z) => ensure(dimension, x, z),
      )
        ? event.p
        : null;
    },
    lineClear(a, b, dimension) {
      const world = worldFor(dimension);
      const distance = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      if (!Number.isFinite(distance) || distance > 128) return false;
      const steps = Math.max(1, Math.ceil(distance / 0.2));
      for (let step = 1; step < steps; step++) {
        const t = step / steps;
        if (
          world.solid(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)
        )
          return false;
      }
      return true;
    },
    move(from, to, dimension) {
      const world = worldFor(dimension);
      const length = Math.hypot(to[0] - from[0], to[2] - from[2]);
      if (!Number.isFinite(length) || length > 8) return null;
      const steps = Math.max(1, Math.ceil(length / 0.2));
      let p: Vec = [...from];
      const free = (x: number, y: number, z: number) => {
        if (
          y < 1 ||
          y > 65 ||
          ![-0.42, 0, 0.42].some((dx) =>
            [-0.42, 0, 0.42].some((dz) => world.solid(x + dx, y - 0.05, z + dz)),
          )
        )
          return false;
        for (const dx of [-0.42, 0, 0.42])
          for (const dz of [-0.42, 0, 0.42]) {
            for (const height of [0.05, 0.95, 1.9, 2.85, 3.8]) {
              if (
                world.solid(x + dx, y + height, z + dz) ||
                [7, 15].includes(world.get(x + dx, y + height, z + dz))
              )
                return false;
            }
          }
        return true;
      };
      for (let step = 1; step <= steps; step++) {
        const x = from[0] + ((to[0] - from[0]) * step) / steps;
        const z = from[2] + ((to[2] - from[2]) * step) / steps;
        ensure(dimension, x, z);
        const base = Math.round(p[1]);
        const y = [base, base + 1, base - 1, base - 2].find((height) => free(x, height, z));
        if (y === undefined) return p;
        p = [x, y, z];
      }
      return p;
    },
  };
}
