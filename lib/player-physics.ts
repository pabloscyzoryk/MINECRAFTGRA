import type { Vector3 } from "three";

export function fallDamage(distance: number) {
  return Number.isFinite(distance) ? Math.max(0, Math.ceil(distance - 3 - 0.0001)) : 0;
}

/** Sweeps in small steps and resolves the exact contact instead of rewinding a whole frame. */
export function moveVertical(
  position: Vector3,
  delta: number,
  collision: (p: Vector3) => boolean,
  grounded = false,
) {
  if (!Number.isFinite(delta) || !delta) return { landed: false, hit: false, distance: 0 };
  const start = position.y;
  // Stable contact needs one probe, not a binary search on every rendered frame.
  if (grounded && delta < 0) {
    position.y -= 0.0001;
    const supported = collision(position);
    position.y = start;
    if (supported) return { landed: true, hit: true, distance: 0 };
  }
  const steps = Math.max(1, Math.ceil(Math.abs(delta) / 0.2));
  const step = delta / steps;
  for (let i = 0; i < steps; i++) {
    const free = position.y;
    position.y += step;
    if (collision(position)) {
      let safe = free,
        blocked = position.y;
      for (let j = 0; j < 16; j++) {
        position.y = (safe + blocked) / 2;
        if (collision(position)) blocked = position.y;
        else safe = position.y;
      }
      position.y = safe;
      return { landed: delta < 0, hit: true, distance: Math.max(0, start - position.y) };
    }
  }
  return { landed: false, hit: false, distance: Math.max(0, start - position.y) };
}

export function clearDamagePath(
  from: Vector3,
  to: Vector3,
  solid: (x: number, y: number, z: number) => boolean,
) {
  const dx = to.x - from.x,
    dy = to.y - from.y,
    dz = to.z - from.z;
  const length = Math.hypot(dx, dy, dz);
  if (!Number.isFinite(length) || length > 128) return false;
  const steps = Math.max(1, Math.ceil(length / 0.15));
  for (let step = 1; step < steps; step++) {
    const t = step / steps;
    if (solid(from.x + dx * t, from.y + dy * t, from.z + dz * t)) return false;
  }
  return true;
}
