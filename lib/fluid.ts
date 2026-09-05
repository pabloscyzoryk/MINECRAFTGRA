import { BLOCKS } from "./blocks";
import type { World } from "./world";
// A source has level 0; horizontal flow uses 1..7; a waterfall uses level 8.
// Recomputing from neighbours lets streams drain when their source is removed.
export class FluidSystem {
  queue = new Set<string>();
  timer = 0;
  constructor(public world: World) {
    world.onEdit = (x, y, z) => this.wake(x, y, z);
  }
  key(x: number, y: number, z: number) {
    return this.world.dimension + ":" + x + "," + y + "," + z;
  }
  level(x: number, y: number, z: number) {
    return this.world.get(x, y, z) === 7 ? (this.world.waterLevels[this.key(x, y, z)] ?? 0) : -1;
  }
  wake(x: number, y: number, z: number) {
    for (const [dx, dy, dz] of [
      [0, 0, 0],
      [1, 0, 0],
      [-1, 0, 0],
      [0, 0, 1],
      [0, 0, -1],
      [0, 1, 0],
      [0, -1, 0],
    ])
      if (y + dy > 0 && y + dy < 71) this.queue.add([x + dx, y + dy, z + dz].join(","));
  }
  clear() {
    this.queue.clear();
  }
  tick(dt: number) {
    this.timer += dt;
    if (this.timer < 0.12) return;
    this.timer = 0;
    this.step();
  }
  step(limit = 700) {
    const cells = Array.from(this.queue).slice(0, limit);
    for (const key of cells) {
      this.queue.delete(key);
      const [x, y, z] = key.split(",").map(Number);
      this.update(x, y, z);
    }
  }
  update(x: number, y: number, z: number) {
    const w = this.world,
      id = w.get(x, y, z),
      level = this.level(x, y, z);
    if (id !== 0 && id !== 7 && id !== 15 && !BLOCKS[id]?.plant) return;
    if (id === 15) {
      // Use the same contact rule whichever queued cell updates first.
      w.coolLava(x, y, z);
      return;
    }
    if (id === 7) {
      for (const [dx, dy, dz] of [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 0, 1],
        [0, 0, -1],
        [0, -1, 0],
      ])
        w.coolLava(x + dx, y + dy, z + dz);
      if (level === 0) return;
    }
    let desired = -1;
    if (this.level(x, y + 1, z) >= 0) desired = 8;
    else {
      let sources = 0;
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const n = this.level(x + dx, y, z + dz);
        if (n === 0) sources++;
        if (n < 0 || n === 7) continue;
        const supported = w.solid(x + dx, y - 1, z + dz) || this.level(x + dx, y - 1, z + dz) === 0;
        if (!supported) continue;
        const candidate = n === 8 ? 1 : n + 1;
        if (candidate <= 7 && (desired < 0 || candidate < desired)) desired = candidate;
      }
      if (sources >= 2 && w.solid(x, y - 1, z)) desired = 0;
    }
    if (level === desired) return;
    const stateKey = this.key(x, y, z);
    if (desired >= 0) {
      w.waterLevels[stateKey] = desired;
      w.set(x, y, z, 7, true);
    } else {
      delete w.waterLevels[stateKey];
      if (id === 7) w.set(x, y, z, 0, true);
    }
    this.wake(x, y, z);
  }
}
