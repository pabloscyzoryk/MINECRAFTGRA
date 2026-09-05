import type { Dimension } from "./blocks";
import type { HorrorContext, HorrorEvent } from "./horror-director";
import { normalizeDifficulty } from "./difficulty";

type Vec = [number, number, number];
export type HuntPhase =
  | "telegraph"
  | "stalk"
  | "lungeTell"
  | "lunge"
  | "vulnerable"
  | "caught"
  | "escaped"
  | "banished";
export type HuntWire = {
  id: string;
  dimension: Dimension;
  p: Vec;
  yaw: number;
  phase: HuntPhase;
  hp: number;
  maxHp: number;
  targetId: string;
  viewerIds: string[];
  at: number;
  phaseAt: number;
  phaseDuration: number;
  seed: number;
  lungeTo?: Vec;
  hurt?: number;
};
export type HuntEnvironment = {
  place(candidate: Vec, anchor: Vec, dimension: Dimension): Vec | null;
  lineClear(from: Vec, to: Vec, dimension: Dimension): boolean;
  move(from: Vec, to: Vec, dimension: Dimension): Vec | null;
};
export type HuntSignal =
  | { type: "caught"; playerId: string; hunt: HuntWire }
  | { type: "death"; playerId: string; huntId: string }
  | { type: "ended"; hunt: HuntWire; reason: "escaped" | "banished" };
export type HuntAttack = {
  huntId: string;
  attackerId: string;
  damage: number;
  reach: number;
  cooldown: number;
};
export type HuntProjectile = {
  huntId: string;
  attackerId: string;
  damage: number;
  from: Vec;
  to: Vec;
};
export type HuntHit = { ok: boolean; damage: number; banished: boolean };
type HuntState = HuntWire & {
  started: number;
  lost: number;
  far: number;
  nextBlink: number;
  blinks: number;
  lungeFrom: Vec;
  random: number;
  hurtUntil: number;
  lastHits: Map<string, number>;
};
const distance = (a: Vec, b: Vec) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const eye = (p: Vec, height = 1.5): Vec => [p[0], p[1] + height, p[2]];
const terminal = (phase: HuntPhase) => phase === "escaped" || phase === "banished";
const eligible = (player: HorrorContext) =>
  normalizeDifficulty(player.difficulty) === "horror" && player.alive;
const miss: HuntHit = { ok: false, damage: 0, banished: false };

/** A finite, opt-in encounter. Terrain and combat effects belong to the caller, never the director. */
export class HorrorHunt {
  elapsed = 0;
  sequence = 0;
  hunts = new Map<string, HuntState>();
  private safeUntil = new Map<string, number>();
  private signals: HuntSignal[] = [];
  private random(hunt: HuntState) {
    hunt.random = (Math.imul(hunt.random, 1664525) + 1013904223) >>> 0;
    return hunt.random / 4294967296;
  }
  private wire(hunt: HuntState): HuntWire {
    return {
      id: hunt.id,
      dimension: hunt.dimension,
      p: [...hunt.p],
      yaw: hunt.yaw,
      phase: hunt.phase,
      hp: hunt.hp,
      maxHp: hunt.maxHp,
      targetId: hunt.targetId,
      viewerIds: [...hunt.viewerIds],
      at: this.elapsed,
      phaseAt: hunt.phaseAt,
      phaseDuration: hunt.phaseDuration,
      seed: hunt.seed,
      ...(hunt.lungeTo ? { lungeTo: [...hunt.lungeTo] as Vec } : {}),
      hurt: Math.max(0, Math.min(1, (hunt.hurtUntil - this.elapsed) / 0.22)),
    };
  }
  view(playerId: string) {
    return [...this.hunts.values()]
      .filter((hunt) => hunt.viewerIds.includes(playerId))
      .map((hunt) => this.wire(hunt));
  }
  reset(playerId: string) {
    for (const [id, hunt] of this.hunts) {
      if (hunt.targetId === playerId) this.hunts.delete(id);
      else hunt.viewerIds = hunt.viewerIds.filter((viewer) => viewer !== playerId);
    }
    this.signals = this.signals.filter((signal) =>
      signal.type === "ended"
        ? !signal.hunt.viewerIds.includes(playerId)
        : signal.playerId !== playerId,
    );
  }
  start(trigger: HorrorEvent, players: HorrorContext[], env: HuntEnvironment): HuntWire | null {
    const rested = (id: string) => (this.safeUntil.get(id) ?? 0) <= this.elapsed;
    const target = players.find(
      (player) =>
        trigger.viewerIds.includes(player.id) &&
        eligible(player) &&
        player.active &&
        player.dimension === trigger.dimension &&
        rested(player.id),
    );
    if (!target || this.view(target.id).length) return null;
    let position: Vec | null = null;
    for (const offset of [Math.PI + 0.6, Math.PI - 0.6, 1.5, -1.5, 0.6]) {
      const angle = target.yaw + offset,
        candidate: Vec = [
          target.p[0] - Math.sin(angle) * 16,
          target.p[1],
          target.p[2] - Math.cos(angle) * 16,
        ];
      const placed = env.place(candidate, target.p, target.dimension);
      if (placed && distance(placed, target.p) >= 10 && distance(placed, target.p) <= 30) {
        position = placed;
        break;
      }
    }
    if (!position) return null;
    const viewers = players
      .filter(
        (player) =>
          eligible(player) &&
          player.active &&
          player.dimension === target.dimension &&
          distance(player.p, target.p) <= 24 &&
          !this.view(player.id).length &&
          rested(player.id),
      )
      .map((player) => player.id);
    const hunt: HuntState = {
      id: "hunt-" + ++this.sequence,
      dimension: target.dimension,
      p: position,
      yaw: Math.atan2(target.p[0] - position[0], target.p[2] - position[2]),
      phase: "telegraph",
      hp: 140,
      maxHp: 140,
      targetId: target.id,
      viewerIds: viewers,
      at: this.elapsed,
      phaseAt: this.elapsed,
      phaseDuration: 6,
      seed: trigger.seed,
      started: this.elapsed,
      lost: 0,
      far: 0,
      nextBlink: this.elapsed + 9,
      blinks: 0,
      lungeFrom: [...position],
      random: trigger.seed >>> 0,
      hurtUntil: 0,
      lastHits: new Map(),
    };
    this.hunts.set(hunt.id, hunt);
    return this.wire(hunt);
  }
  private phase(hunt: HuntState, phase: HuntPhase, duration: number) {
    hunt.phase = phase;
    hunt.phaseAt = this.elapsed;
    hunt.phaseDuration = duration;
    if (phase !== "lungeTell" && phase !== "lunge") delete hunt.lungeTo;
  }
  private end(hunt: HuntState, reason: "escaped" | "banished") {
    if (terminal(hunt.phase)) return;
    this.phase(hunt, reason, 2.5);
    for (const id of hunt.viewerIds)
      this.safeUntil.set(id, this.elapsed + (reason === "banished" ? 180 : 90));
    this.signals.push({ type: "ended", hunt: this.wire(hunt), reason });
  }
  private looking(player: HorrorContext, p: Vec) {
    const from = eye(player.p),
      to = eye(p, 1.8),
      length = distance(from, to);
    return (
      length > 0 &&
      (-Math.sin(player.yaw) * Math.cos(player.pitch) * (to[0] - from[0]) +
        Math.sin(player.pitch) * (to[1] - from[1]) -
        Math.cos(player.yaw) * Math.cos(player.pitch) * (to[2] - from[2])) /
        length >
        0.5
    );
  }
  private catch(hunt: HuntState, target: HorrorContext) {
    this.phase(hunt, "caught", 1.3);
    this.signals.push({ type: "caught", playerId: target.id, hunt: this.wire(hunt) });
  }
  tick(dt: number, players: HorrorContext[], env: HuntEnvironment) {
    dt = Math.max(0, Math.min(0.25, Number.isFinite(dt) ? dt : 0));
    this.elapsed += dt;
    for (const [id, until] of this.safeUntil) if (until <= this.elapsed) this.safeUntil.delete(id);
    for (const [id, hunt] of this.hunts) {
      if (terminal(hunt.phase)) {
        if (this.elapsed - hunt.phaseAt >= hunt.phaseDuration) this.hunts.delete(id);
        continue;
      }
      hunt.viewerIds = hunt.viewerIds.filter((viewer) =>
        players.some(
          (player) =>
            player.id === viewer && eligible(player) && player.dimension === hunt.dimension,
        ),
      );
      const target = players.find(
        (player) =>
          player.id === hunt.targetId && eligible(player) && player.dimension === hunt.dimension,
      );
      if (!target || !hunt.viewerIds.length) {
        this.end(hunt, "escaped");
        continue;
      }
      // Menus pause the pursuit, but a completed grab still finishes its 1.3-second scare.
      if (!target.active && hunt.phase !== "caught") {
        hunt.phaseAt += dt;
        hunt.started += dt;
        hunt.nextBlink += dt;
        continue;
      }
      const phaseTime = this.elapsed - hunt.phaseAt;
      if (hunt.phase === "caught") {
        if (phaseTime + 0.000001 >= 1.3) {
          this.signals.push({ type: "death", playerId: target.id, huntId: hunt.id });
          this.phase(hunt, "escaped", 2.5);
        }
        continue;
      }
      const range = distance(hunt.p, target.p),
        clear = env.lineClear(eye(hunt.p, 1.8), eye(target.p), hunt.dimension);
      hunt.lost = clear ? 0 : hunt.lost + dt;
      hunt.far = range > 36 ? hunt.far + dt : 0;
      if (hunt.lost >= 4 || hunt.far >= 2.5 || this.elapsed - hunt.started >= 75) {
        this.end(hunt, "escaped");
        continue;
      }
      hunt.yaw = Math.atan2(target.p[0] - hunt.p[0], target.p[2] - hunt.p[2]);
      if (hunt.phase === "telegraph") {
        if (phaseTime >= 6) this.phase(hunt, "stalk", 0);
      } else if (hunt.phase === "stalk") {
        if (range <= 6.8 && clear) {
          hunt.lungeTo = [...target.p];
          this.phase(hunt, "lungeTell", 1.1);
          continue;
        }
        if (
          range >= 9 &&
          range <= 22 &&
          clear &&
          hunt.blinks < 2 &&
          this.elapsed >= hunt.nextBlink &&
          !players.some(
            (player) =>
              hunt.viewerIds.includes(player.id) && player.active && this.looking(player, hunt.p),
          )
        ) {
          const angle = target.yaw + Math.PI + (this.random(hunt) - 0.5) * 1.4,
            candidate: Vec = [
              target.p[0] - Math.sin(angle) * 12,
              target.p[1],
              target.p[2] - Math.cos(angle) * 12,
            ],
            placed = env.place(candidate, target.p, hunt.dimension);
          if (
            placed &&
            distance(placed, target.p) >= 10 &&
            !players.some(
              (player) =>
                hunt.viewerIds.includes(player.id) && player.active && this.looking(player, placed),
            )
          ) {
            hunt.p = placed;
            hunt.blinks++;
          }
          hunt.nextBlink = this.elapsed + 8 + this.random(hunt) * 4;
        }
        const dx = target.p[0] - hunt.p[0],
          dz = target.p[2] - hunt.p[2],
          length = Math.hypot(dx, dz);
        if (length > 0.1) {
          const step = Math.min(length, 2.8 * dt),
            proposed: Vec = [
              hunt.p[0] + (dx / length) * step,
              hunt.p[1],
              hunt.p[2] + (dz / length) * step,
            ];
          const moved = env.move(hunt.p, proposed, hunt.dimension);
          if (moved) hunt.p = moved;
        }
      } else if (hunt.phase === "lungeTell") {
        if (phaseTime + 0.000001 >= 1.1) {
          hunt.lungeFrom = [...hunt.p];
          this.phase(hunt, "lunge", 0.55);
        }
      } else if (hunt.phase === "lunge") {
        const goal = hunt.lungeTo!,
          progress = Math.min(1, phaseTime / 0.55),
          proposed = hunt.lungeFrom.map(
            (value, axis) => value + (goal[axis] - value) * progress,
          ) as Vec,
          before: Vec = [...hunt.p],
          moved = env.move(before, proposed, hunt.dimension);
        if (moved) {
          hunt.p = moved;
          const steps = Math.max(1, Math.ceil(distance(before, moved) / 0.2));
          for (let step = 0; step <= steps; step++) {
            const point = before.map(
              (value, axis) => value + ((moved[axis] - value) * step) / steps,
            ) as Vec;
            if (
              Math.hypot(point[0] - target.p[0], point[2] - target.p[2]) < 0.8 &&
              Math.abs(point[1] - target.p[1]) < 1.5 &&
              env.lineClear(eye(point), eye(target.p), hunt.dimension)
            ) {
              this.catch(hunt, target);
              break;
            }
          }
        }
        if (hunt.phase === "lunge" && (!moved || progress >= 1))
          this.phase(hunt, "vulnerable", 2.4);
      } else if (hunt.phase === "vulnerable" && phaseTime >= 2.4) this.phase(hunt, "stalk", 0);
    }
    const signals = this.signals;
    this.signals = [];
    return { hunts: [...this.hunts.values()].map((hunt) => this.wire(hunt)), signals };
  }
  private hit(
    hunt: HuntState,
    attacker: HorrorContext,
    damage: number,
    cooldown: number,
    env: HuntEnvironment,
  ): HuntHit {
    if (
      !Number.isFinite(damage) ||
      damage <= 0 ||
      terminal(hunt.phase) ||
      hunt.phase === "caught" ||
      hunt.phase === "telegraph"
    )
      return miss;
    if (this.elapsed - (hunt.lastHits.get(attacker.id) ?? -Infinity) + 0.000001 < cooldown)
      return miss;
    hunt.lastHits.set(attacker.id, this.elapsed);
    const amount = Math.min(40, damage) * (hunt.phase === "vulnerable" ? 1.45 : 0.2);
    hunt.hp = Math.max(0, hunt.hp - amount);
    hunt.hurtUntil = this.elapsed + 0.22;
    if (hunt.hp <= 0) this.end(hunt, "banished");
    else if (hunt.phase === "vulnerable") {
      const dx = hunt.p[0] - attacker.p[0],
        dz = hunt.p[2] - attacker.p[2],
        length = Math.hypot(dx, dz);
      if (length)
        hunt.p =
          env.move(
            hunt.p,
            [hunt.p[0] + (dx / length) * 0.3, hunt.p[1], hunt.p[2] + (dz / length) * 0.3],
            hunt.dimension,
          ) ?? hunt.p;
    }
    return { ok: true, damage: amount, banished: hunt.hp <= 0 };
  }
  attack(attack: HuntAttack, players: HorrorContext[], env: HuntEnvironment): HuntHit {
    const hunt = this.hunts.get(attack.huntId),
      attacker = players.find(
        (player) => player.id === attack.attackerId && eligible(player) && player.active,
      );
    if (
      !hunt ||
      !attacker ||
      attacker.dimension !== hunt.dimension ||
      !hunt.viewerIds.includes(attacker.id) ||
      !Number.isFinite(attack.reach) ||
      attack.reach <= 0 ||
      !Number.isFinite(attack.cooldown)
    )
      return miss;
    const from = eye(attacker.p),
      to = eye(hunt.p, 1.7);
    if (
      distance(from, to) > Math.min(6, attack.reach) + 0.55 ||
      !this.looking(attacker, hunt.p) ||
      !env.lineClear(from, to, hunt.dimension)
    )
      return miss;
    return this.hit(hunt, attacker, attack.damage, Math.max(0.25, attack.cooldown), env);
  }
  projectileHit(shot: HuntProjectile, players: HorrorContext[], env: HuntEnvironment): HuntHit {
    const hunt = this.hunts.get(shot.huntId),
      attacker = players.find((player) => player.id === shot.attackerId && eligible(player));
    if (
      !hunt ||
      !attacker ||
      attacker.dimension !== hunt.dimension ||
      !hunt.viewerIds.includes(attacker.id) ||
      ![...shot.from, ...shot.to].every(Number.isFinite) ||
      distance(shot.from, shot.to) > 20
    )
      return miss;
    const steps = Math.max(1, Math.ceil(distance(shot.from, shot.to) / 0.2));
    for (let step = 0; step <= steps; step++) {
      const point = shot.from.map(
        (value, axis) => value + ((shot.to[axis] - value) * step) / steps,
      ) as Vec;
      if (
        Math.hypot(point[0] - hunt.p[0], point[2] - hunt.p[2]) <= 0.7 &&
        point[1] >= hunt.p[1] &&
        point[1] <= hunt.p[1] + 3.8 &&
        env.lineClear(shot.from, point, hunt.dimension)
      )
        return this.hit(hunt, attacker, shot.damage, 0.2, env);
    }
    return miss;
  }
}
