import { normalizeDifficulty, type Difficulty } from "./difficulty";
import type { Dimension } from "./blocks";
type Vec = [number, number, number];
export type HorrorKind =
  | "whisper"
  | "knock"
  | "watcher"
  | "silhouette"
  | "approach"
  | "jumpscare"
  | "recovery"
  | "vanish";
export type HorrorEvent = {
  id: string;
  kind: HorrorKind;
  p: Vec;
  duration: number;
  intensity: number;
  seed: number;
  reason: string;
  viewerIds: string[];
  dimension: Dimension;
  at: number;
  yaw: number;
  targetId?: string;
};
export type HorrorContext = {
  id: string;
  p: Vec;
  yaw: number;
  pitch: number;
  dimension: Dimension;
  difficulty: Difficulty;
  active: boolean;
  alive: boolean;
  night: boolean;
  underground: boolean;
};
type Progress = {
  age: number;
  stage: number;
  tension: number;
  nextAt: number;
  cycle: number;
  random: number;
  nextWatch?: number;
};
export type HorrorSave = {
  version: 1;
  elapsed: number;
  sequence: number;
  states: [string, Progress][];
};
const stages: HorrorKind[] = [
  "whisper",
  "knock",
  "watcher",
  "silhouette",
  "approach",
  "jumpscare",
  "recovery",
];
const minimum = [45, 80, 120, 180, 235, 300, 301];
const distance = (a: Vec, b: Vec) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const visual = (kind: HorrorKind) => ["watcher", "silhouette", "approach"].includes(kind);

/** Psychological encounters only: this director cannot change blocks, damage players or write chat. */
export class HorrorDirector {
  elapsed = 0;
  sequence = 0;
  states = new Map<string, Progress>();
  activeEvents = new Map<string, HorrorEvent>();
  constructor(public seed = 24680) {}
  private random(state: Progress) {
    state.random = (Math.imul(state.random, 1664525) + 1013904223) >>> 0;
    return state.random / 4294967296;
  }
  private progress(id: string) {
    let s = this.states.get(id);
    if (!s) {
      let seed = this.seed;
      for (const c of id) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
      s = { age: 0, stage: 0, tension: 0, nextAt: 0, cycle: 0, random: seed >>> 0 };
      s.nextAt = 45 + this.random(s) * 30;
      this.states.set(id, s);
    }
    return s;
  }
  reset(id: string) {
    this.states.delete(id);
    for (const [key, event] of this.activeEvents) {
      event.viewerIds = event.viewerIds.filter((viewer) => viewer !== id);
      if (!event.viewerIds.length) this.activeEvents.delete(key);
    }
  }
  tick(dt: number, contexts: HorrorContext[]): HorrorEvent[] {
    dt = Math.max(0, Math.min(1, Number.isFinite(dt) ? dt : 0));
    this.elapsed += dt;
    const events: HorrorEvent[] = [],
      eligible = contexts.filter(
        (c) => normalizeDifficulty(c.difficulty) === "horror" && c.active && c.alive,
      ),
      byId = new Map(eligible.map((c) => [c.id, c]));
    for (const [key, event] of this.activeEvents) {
      const viewers = event.viewerIds.filter((id) => byId.get(id)?.dimension === event.dimension);
      const looked =
        visual(event.kind) &&
        this.elapsed - event.at > (event.reason === "passive-watch" ? 0.8 : 0.2) &&
        viewers.some((id) => {
          const c = byId.get(id)!,
            dx = event.p[0] - c.p[0],
            dy = event.p[1] + 1.6 - (c.p[1] + 1.5),
            dz = event.p[2] - c.p[2];
          const length = Math.hypot(dx, dy, dz);
          return (
            length > 0 &&
            (-Math.sin(c.yaw) * Math.cos(c.pitch) * dx +
              Math.sin(c.pitch) * dy -
              Math.cos(c.yaw) * Math.cos(c.pitch) * dz) /
              length >
              (event.reason === "passive-watch" ? 0.99 : 0.94)
          );
        });
      if (!viewers.length || looked || this.elapsed - event.at >= event.duration) {
        this.activeEvents.delete(key);
        if (viewers.length && visual(event.kind))
          events.push({
            ...event,
            id: "h" + ++this.sequence,
            kind: "vanish",
            targetId: key,
            at: this.elapsed,
            duration: 0.35,
            reason: looked ? "looked" : "faded",
            viewerIds: viewers,
          });
      }
    }
    for (const c of eligible) {
      const s = this.progress(c.id);
      s.age += dt;
      const alone = !contexts.some(
          (q) =>
            q.id !== c.id &&
            q.active &&
            q.alive &&
            q.dimension === c.dimension &&
            distance(q.p, c.p) < 24,
        ),
        risk = 1 + Number(c.night) * 0.35 + Number(c.underground) * 0.45 + Number(alone) * 0.3;
      s.tension = Math.min(1, s.tension + (dt * risk) / 300);
      // A motionless presence between the main encounters never advances a stage,
      // starts a hunt or harms anyone. It appears sparsely, outside focused vision.
      if (s.stage >= 3 && s.stage <= 5 && s.age < s.nextAt - 18) {
        s.nextWatch ??= s.age + 17 + this.random(s) * 9;
        const busy = [...this.activeEvents.values()].some((event) =>
          event.viewerIds.includes(c.id),
        );
        if (!busy && s.age >= s.nextWatch) {
          const angle = c.yaw + (this.random(s) > 0.5 ? 1 : -1) * (0.5 + this.random(s) * 0.35),
            range = 26 + this.random(s) * 10,
            p: Vec = [c.p[0] - Math.sin(angle) * range, c.p[1], c.p[2] - Math.cos(angle) * range],
            viewers = eligible.filter(
              (q) =>
                q.dimension === c.dimension &&
                distance(q.p, c.p) < 18 &&
                ![...this.activeEvents.values()].some((event) => event.viewerIds.includes(q.id)),
            ),
            event: HorrorEvent = {
              id: "h" + ++this.sequence,
              kind: "watcher",
              p,
              at: this.elapsed,
              duration: 12 + this.random(s) * 5,
              intensity: 0.24 + this.random(s) * 0.08,
              seed: Math.floor(this.random(s) * 0x7fffffff),
              reason: "passive-watch",
              viewerIds: viewers.map((q) => q.id),
              dimension: c.dimension,
              yaw: Math.atan2(c.p[0] - p[0], c.p[2] - p[2]),
            };
          events.push(event);
          this.activeEvents.set(event.id, event);
          for (const q of viewers) {
            const state = this.progress(q.id);
            state.nextWatch = state.age + 38 + this.random(state) * 24;
          }
        }
      }
      if (s.age < s.nextAt) continue;
      const kind = stages[s.stage],
        peers = visual(kind)
          ? eligible.filter(
              (q) =>
                q.dimension === c.dimension &&
                distance(q.p, c.p) < 18 &&
                this.progress(q.id).stage === s.stage &&
                this.progress(q.id).age >= minimum[s.stage],
            )
          : [c],
        viewers = peers.length ? peers : [c],
        angle = c.yaw + (kind === "watcher" ? 0.75 : kind === "silhouette" ? 1.35 : Math.PI + 0.25),
        range =
          kind === "watcher"
            ? 20 + this.random(s) * 8
            : kind === "silhouette"
              ? 9
              : kind === "approach"
                ? 3.8
                : kind === "jumpscare"
                  ? 1.4
                  : 5,
        p: Vec = [c.p[0] - Math.sin(angle) * range, c.p[1], c.p[2] - Math.cos(angle) * range],
        event: HorrorEvent = {
          id: "h" + ++this.sequence,
          kind,
          p,
          at: this.elapsed,
          duration:
            kind === "jumpscare"
              ? 1.1
              : kind === "recovery"
                ? 8
                : kind === "watcher"
                  ? 9
                  : kind === "approach"
                    ? 4
                    : 5,
          intensity:
            kind === "jumpscare" ? 0.9 : Math.min(0.8, 0.15 + s.stage * 0.09 + s.tension * 0.18),
          seed: Math.floor(this.random(s) * 0x7fffffff),
          reason:
            kind === "recovery"
              ? "recovery"
              : c.underground
                ? "underground"
                : c.night
                  ? "night"
                  : alone
                    ? "alone"
                    : "presence",
          viewerIds: viewers.map((q) => q.id),
          dimension: c.dimension,
          yaw: Math.atan2(c.p[0] - p[0], c.p[2] - p[2]),
        };
      events.push(event);
      if (visual(kind)) this.activeEvents.set(event.id, event);
      for (const q of viewers) {
        const state = this.progress(q.id);
        if (kind === "recovery") {
          state.age = 0;
          state.stage = 0;
          state.tension = 0.1;
          state.cycle++;
          state.nextAt = 90 + this.random(state) * 30;
          delete state.nextWatch;
        } else {
          state.stage++;
          const wait =
            kind === "jumpscare" ? 1.8 : (30 + this.random(state) * 25) / Math.min(1.3, risk);
          state.nextAt = Math.max(minimum[state.stage], state.age + wait);
          if (state.stage === 2 && state.cycle === 0) state.nextAt = Math.min(180, state.nextAt);
        }
      }
    }
    return events;
  }
  save(): HorrorSave {
    return {
      version: 1,
      elapsed: this.elapsed,
      sequence: this.sequence,
      states: [...this.states].map(([id, s]) => [id, { ...s }]),
    };
  }
  restore(value: unknown) {
    this.states.clear();
    this.activeEvents.clear();
    this.elapsed = 0;
    this.sequence = 0;
    const data = value as Partial<HorrorSave> | null;
    if (!data || data.version !== 1 || !Array.isArray(data.states)) return;
    this.elapsed = Number.isFinite(data.elapsed) ? Math.max(0, Number(data.elapsed)) : 0;
    this.sequence = Number.isSafeInteger(data.sequence) ? Math.max(0, Number(data.sequence)) : 0;
    for (const entry of data.states) {
      if (!Array.isArray(entry) || typeof entry[0] !== "string" || !entry[1]) continue;
      const [id, s] = entry;
      if (![s.age, s.stage, s.tension, s.nextAt, s.cycle, s.random].every(Number.isFinite))
        continue;
      if (!Number.isInteger(s.stage) || s.stage < 0 || s.stage > 6) continue;
      const age = Math.max(0, s.age);
      this.states.set(id, {
        age,
        stage: s.stage,
        tension: Math.max(0, Math.min(1, s.tension)),
        nextAt: Math.max(age + 30, s.nextAt),
        cycle: Math.max(0, Math.floor(s.cycle)),
        random: s.random >>> 0,
        ...(Number.isFinite(s.nextWatch)
          ? { nextWatch: Math.max(age + 15, Number(s.nextWatch)) }
          : {}),
      });
    }
  }
}
