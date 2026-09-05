export type MouseMotionSample = {
  movementX: number;
  movementY: number;
  timeStamp?: number;
  clientX?: number;
  clientY?: number;
  sourceCapabilities?: { firesTouchEvents?: boolean } | null;
};

/** Keeps lock transitions and OS cursor warps out of relative FPS motion. */
export class PointerMotion {
  raw = false;
  private locked = false;
  private started = 0;
  private first = true;
  private anchor: { x: number; y: number } | null = null;
  private lastTime = 0;
  private vertical: number[] = [];
  private pending: { y: number; at: number } | null = null;

  reset() {
    this.locked = false;
    this.first = true;
    this.anchor = null;
    this.vertical = [];
    this.pending = null;
    this.lastTime = 0;
  }

  lock(now: number) {
    if (this.locked) return;
    this.reset();
    this.locked = true;
    this.started = now;
  }

  sample(event: MouseMotionSample, now: number): { x: number; y: number } | null {
    if (!this.locked || event.sourceCapabilities?.firesTouchEvents) return null;
    const x = event.movementX;
    let y = event.movementY;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    // Modern event timestamps share performance.now's origin. Older epoch-based
    // timestamps are intentionally excluded from this stale-packet check.
    const stamp = event.timeStamp;
    if (stamp !== undefined && stamp > 0 && stamp <= now + 1000 && stamp < this.started)
      return null;
    let warped = false;
    if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
      const anchor = { x: event.clientX!, y: event.clientY! };
      // Absolute coordinates remain fixed while locked (Pointer Lock spec).
      warped =
        !!this.anchor &&
        Math.hypot(anchor.x - this.anchor.x, anchor.y - this.anchor.y) > 32 &&
        Math.hypot(x, y) > 64;
      this.anchor = anchor;
    }
    const gap = now - this.lastTime;
    this.lastTime = now;
    if (this.first || warped) {
      this.first = false;
      this.vertical = [];
      this.pending = null;
      return null;
    }
    if (!x && !y) return { x, y };
    // A single exceptional vertical packet during a horizontal stroke can be
    // a driver warp. Confirm it with one subsequent packet, never smoothing or
    // limiting ordinary movement, horizontal flicks, or vertical-only flicks.
    const pending = this.pending;
    this.pending = null;
    if (
      pending &&
      now - pending.at <= 40 &&
      Math.sign(y) === Math.sign(pending.y) &&
      Math.abs(y) >= Math.abs(pending.y) * 0.12
    ) {
      y += pending.y;
    } else if (
      !this.raw &&
      gap <= 20 &&
      this.vertical.length >= 4 &&
      Math.abs(x) >= 2 &&
      Math.abs(y) > Math.max(180, ...this.vertical.map((n) => n * 12)) &&
      Math.abs(y) > Math.abs(x) * 4
    ) {
      this.pending = { y, at: now };
      return { x, y: 0 };
    }
    if (gap > 80) this.vertical = [];
    this.vertical.push(Math.abs(y));
    if (this.vertical.length > 6) this.vertical.shift();
    return { x, y };
  }
}
