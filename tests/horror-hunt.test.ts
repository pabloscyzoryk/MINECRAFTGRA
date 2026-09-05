import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { HorrorHunt, type HuntEnvironment, type HuntSignal } from "../lib/horror-hunt";
import type { HorrorContext, HorrorEvent } from "../lib/horror-director";
import { Room } from "../server/room";
import { weapon } from "../lib/combat";

const context = (id = "a", overrides: Partial<HorrorContext> = {}): HorrorContext => ({
  id,
  p: [0, 50, 0],
  yaw: 0,
  pitch: 0,
  dimension: "overworld",
  difficulty: "horror",
  active: true,
  alive: true,
  night: true,
  underground: false,
  ...overrides,
});
const flat: HuntEnvironment = {
  place: (candidate) => [...candidate],
  move: (_from, to) => [...to],
  lineClear: () => true,
};
const trigger = (ids = ["a"]): HorrorEvent => ({
  id: "trigger",
  kind: "jumpscare",
  p: [0, 50, -1.4],
  duration: 1.3,
  intensity: 1,
  seed: 37,
  reason: "night",
  viewerIds: ids,
  dimension: "overworld",
  at: 300,
  yaw: 0,
});
function advance(
  hunt: HorrorHunt,
  seconds: number,
  players: HorrorContext[],
  env = flat,
  before: (dt: number) => void = () => {},
) {
  const signals: HuntSignal[] = [];
  for (let i = 0; i < Math.round(seconds / 0.05); i++) {
    before(0.05);
    signals.push(...hunt.tick(0.05, players, env).signals);
  }
  return signals;
}
function closeEncounter(players = [context()]) {
  const hunt = new HorrorHunt(),
    wire = hunt.start(trigger(), players, flat)!;
  const state = hunt.hunts.get(wire.id)!;
  state.p = [0, 50, -6];
  state.blinks = 2;
  return { hunt, state, players };
}

test("Hunts start far away after their trigger and only include eligible nearby Horror players", () => {
  const hunt = new HorrorHunt(),
    players = [
      context(),
      context("friend", { p: [2, 50, 0] }),
      context("normal", { difficulty: "normal" }),
      context("paused", { active: false }),
      context("far", { p: [30, 50, 0] }),
      context("end", { dimension: "end" }),
    ];
  const wire = hunt.start(trigger(), players, flat)!;
  assert.equal(wire.phase, "telegraph");
  assert.equal(wire.phaseDuration, 6);
  assert.equal(Math.round(Math.hypot(wire.p[0], wire.p[2])), 16);
  assert.deepEqual(wire.viewerIds, ["a", "friend"]);
  assert.equal(hunt.view("normal").length, 0);
  assert.equal(hunt.start(trigger(), players, flat), null);
  assert.equal(new HorrorHunt().start(trigger(), [context("a", { active: false })], flat), null);
  assert.equal(new HorrorHunt().start(trigger(), players, { ...flat, place: () => null }), null);
  assert.equal(
    new HorrorHunt().start(trigger(), players, { ...flat, place: () => [0, 50, -1] }),
    null,
  );
  wire.p[0] = 900;
  wire.viewerIds.push("normal");
  assert.notEqual(hunt.view("a")[0].p[0], 900);
  assert.equal(hunt.view("normal").length, 0);
});

test("Stationary target gets six-second warning and a lunge tell, then scare before one death even in a menu", () => {
  const { hunt, state, players } = closeEncounter();
  assert.deepEqual(advance(hunt, 5.9, players), []);
  assert.equal(state.phase, "telegraph");
  advance(hunt, 0.2, players);
  assert.equal(state.phase, "lungeTell");
  assert.deepEqual(state.lungeTo, players[0].p);
  assert.deepEqual(advance(hunt, 1, players), []);
  assert.equal(state.phase, "lungeTell");
  let signals: HuntSignal[] = [];
  for (let i = 0; i < 30 && state.phase !== "caught"; i++)
    signals.push(...hunt.tick(0.05, players, flat).signals);
  assert.equal(signals.filter((s) => s.type === "caught").length, 1);
  assert.equal(
    signals.some((s) => s.type === "death"),
    false,
  );
  const caughtAt = hunt.elapsed;
  players[0].active = false;
  assert.equal(
    advance(hunt, 1.25, players).some((s) => s.type === "death"),
    false,
  );
  signals = advance(hunt, 0.05, players);
  assert.equal(signals.filter((s) => s.type === "death").length, 1);
  assert(Math.abs(hunt.elapsed - caughtAt - 1.3) < 0.00001);
  assert.equal(
    advance(hunt, 5, players).some((s) => s.type === "death"),
    false,
  );
});

test("Opting out, disconnecting, dimension change and reset cancel caught consequences", () => {
  for (const change of ["difficulty", "dimension", "disconnect", "reset"] as const) {
    const { hunt, state, players } = closeEncounter();
    state.phase = "caught";
    state.phaseAt = hunt.elapsed;
    state.phaseDuration = 1.3;
    if (change === "difficulty") players[0].difficulty = "normal";
    if (change === "dimension") players[0].dimension = "end";
    if (change === "disconnect") players.length = 0;
    if (change === "reset") hunt.reset("a");
    assert.equal(
      advance(hunt, 4, players).some((s) => s.type === "death"),
      false,
      change,
    );
    assert.equal(hunt.view("a").length, 0);
  }
});

test("Real sprinting movement escapes, rather than ending in a timer kill, and gives 90 seconds of safety", () => {
  const player = context(),
    hunt = new HorrorHunt();
  hunt.start(trigger(), [player], flat);
  const signals = advance(hunt, 15, [player], flat, (dt) => {
    player.p[2] -= 7 * dt;
  });
  assert(signals.some((s) => s.type === "ended" && s.reason === "escaped"));
  assert.equal(
    signals.some((s) => s.type === "caught" || s.type === "death"),
    false,
  );
  assert.equal(hunt.start(trigger(), [player], flat), null);
  advance(hunt, 90, [player]);
  assert(hunt.start(trigger(), [player], flat));
});

test("A sideways dodge after the lunge tell leaves the Guest vulnerable at the original aim point", () => {
  const { hunt, state, players } = closeEncounter();
  advance(hunt, 6.1, players);
  const aim = [...state.lungeTo!];
  const signals = advance(hunt, 1.7, players, flat, (dt) => {
    players[0].p[0] += 5 * dt;
  });
  assert.deepEqual(state.p, aim);
  assert.equal(state.phase, "vulnerable");
  assert.equal(
    signals.some((s) => s.type === "caught"),
    false,
  );
  assert.equal(state.phaseDuration, 2.4);
});

test("Walls block the lunge and breaking line of sight produces an escape", () => {
  const { hunt, state, players } = closeEncounter();
  state.phase = "lunge";
  state.phaseDuration = 0.55;
  state.lungeFrom = [...state.p];
  state.lungeTo = [...players[0].p];
  const wall: HuntEnvironment = { ...flat, move: (from) => [...from], lineClear: () => false };
  const signals = advance(hunt, 5, players, wall);
  assert.deepEqual(state.p, [0, 50, -6]);
  assert.equal(
    signals.some((s) => s.type === "caught" || s.type === "death"),
    false,
  );
  assert(signals.some((s) => s.type === "ended" && s.reason === "escaped"));
});

test("Watching prevents flank teleports; unseen blinks stay at least ten blocks from target", () => {
  const { hunt, state, players } = closeEncounter();
  state.phase = "stalk";
  state.p = [0, 50, -14];
  state.blinks = 0;
  state.nextBlink = 0;
  const fixed = {
    ...flat,
    move: (from: [number, number, number]) => [...from] as [number, number, number],
  };
  advance(hunt, 0.5, players, fixed);
  assert.equal(state.blinks, 0);
  players[0].yaw = Math.PI;
  advance(hunt, 0.1, players, fixed);
  assert.equal(state.blinks, 1);
  assert(Math.hypot(state.p[0], state.p[2]) >= 10);
});

test("Weapon cooldown, facing, range, line of sight and vulnerability make combat deliberate", () => {
  const { hunt, state, players } = closeEncounter();
  state.p = [0, 50, -2];
  state.phase = "stalk";
  const attack = { huntId: state.id, attackerId: "a", damage: 9, cooldown: 0.6, reach: 3 };
  assert.equal(hunt.attack(attack, players, flat).damage, 1.8);
  assert.equal(hunt.attack(attack, players, flat).ok, false);
  advance(hunt, 0.6, [{ ...players[0], active: false }]);
  state.phase = "vulnerable";
  state.phaseAt = hunt.elapsed;
  assert.equal(hunt.attack(attack, players, flat).damage, 13.049999999999999);
  assert.equal(
    hunt.attack(
      { ...attack, attackerId: "normal" },
      [context("normal", { difficulty: "normal" })],
      flat,
    ).ok,
    false,
  );
  advance(hunt, 0.6, [{ ...players[0], active: false }]);
  assert.equal(hunt.attack(attack, players, { ...flat, lineClear: () => false }).ok, false);
  assert.equal(hunt.attack(attack, [{ ...players[0], yaw: Math.PI }], flat).ok, false);
  assert.equal(hunt.attack(attack, [{ ...players[0], p: [0, 50, 15] }], flat).ok, false);
});

test("Two players can banish the shared target with correctly spaced vulnerable hits and earn long recovery", () => {
  const players = [context(), context("b")],
    { hunt, state } = closeEncounter(players);
  state.p = [0, 50, -2];
  state.phase = "vulnerable";
  state.phaseDuration = 2.4;
  const noKnock = {
    ...flat,
    move: (from: [number, number, number]) => [...from] as [number, number, number],
  };
  let hits = 0;
  for (let i = 0; i < 6 && state.hp > 0; i++) {
    for (const player of players) {
      const result = hunt.attack(
        { huntId: state.id, attackerId: player.id, damage: 12, reach: 3.2, cooldown: 0.55 },
        players,
        noKnock,
      );
      if (result.ok) hits++;
    }
    advance(
      hunt,
      0.55,
      players.map((p) => ({ ...p, active: false })),
      noKnock,
    );
  }
  assert.equal(state.hp, 0);
  assert.equal(state.phase, "banished");
  assert.equal(hits, 9);
  advance(hunt, 3, players, noKnock);
  assert.equal(hunt.start(trigger(["a", "b"]), players, flat), null);
  advance(hunt, 175, players);
  assert.equal(hunt.start(trigger(["a", "b"]), players, flat), null);
  advance(hunt, 6, players);
  assert(hunt.start(trigger(["a", "b"]), players, flat));
});

test("Swept arrows hit between frames without melee range, and cannot pass a wall", () => {
  const { hunt, state, players } = closeEncounter();
  state.phase = "vulnerable";
  state.p = [0, 50, -12];
  const shot = {
    huntId: state.id,
    attackerId: "a",
    damage: 20,
    from: [0, 51.5, -10] as [number, number, number],
    to: [0, 51.5, -14] as [number, number, number],
  };
  assert.equal(hunt.projectileHit(shot, players, { ...flat, lineClear: () => false }).ok, false);
  assert.equal(hunt.projectileHit(shot, players, flat).damage, 29);
  assert.equal(hunt.projectileHit(shot, players, flat).ok, false);
  advance(
    hunt,
    0.25,
    players.map((p) => ({ ...p, active: false })),
  );
  assert.equal(hunt.projectileHit(shot, [{ ...players[0], difficulty: "normal" }], flat).ok, false);
  assert.equal(hunt.projectileHit({ ...shot, to: [0, 51, -100] }, players, flat).ok, false);
});

test("An active solo player can win using real axe cooldowns and repeated sideways dodges", () => {
  const { hunt, state, players } = closeEncounter(),
    player = players[0],
    stats = weapon(127);
  let previousPhase = "",
    dodge: [number, number] = [1, 0],
    hits = 0;
  const signals: HuntSignal[] = [];
  for (let i = 0; i < 1500 && state.hp > 0; i++) {
    const dx = state.p[0] - player.p[0],
      dz = state.p[2] - player.p[2],
      range = Math.hypot(dx, dz);
    player.yaw = Math.atan2(-dx, -dz);
    if (state.phase === "lungeTell" && previousPhase !== "lungeTell")
      dodge = [dz / range, -dx / range];
    if (state.phase === "lungeTell" || state.phase === "lunge") {
      player.p[0] += dodge[0] * 7 * 0.05;
      player.p[2] += dodge[1] * 7 * 0.05;
    } else if (state.phase === "vulnerable") {
      if (range > 2.2) {
        const step = Math.min(range - 2.2, 7 * 0.05);
        player.p[0] += (dx / range) * step;
        player.p[2] += (dz / range) * step;
      }
      if (hunt.attack({ huntId: state.id, attackerId: player.id, ...stats }, players, flat).ok)
        hits++;
    }
    previousPhase = state.phase;
    signals.push(...hunt.tick(0.05, players, flat).signals);
  }
  assert.equal(state.phase, "banished");
  assert.equal(state.hp, 0);
  assert(hits >= 11);
  assert(hunt.elapsed > 20 && hunt.elapsed < 75);
  assert.equal(
    signals.some((s) => s.type === "caught" || s.type === "death"),
    false,
  );
});

function server() {
  let now = 100000;
  const messages: { id: string; data: any }[] = [],
    room = new Room(
      (id, data) => messages.push({ id, data }),
      () => now,
    );
  room.populate = () => {};
  room.huntEnvironment = flat;
  room.join("a", "Alicja", undefined, "horror");
  room.join("b", "Bartek", undefined, "normal");
  const a = room.players.get("a")!,
    b = room.players.get("b")!;
  for (const p of [a, b]) {
    p.p = [0, 50, 0];
    p.active = true;
  }
  return {
    room,
    messages,
    a,
    b,
    step(seconds: number, full = false) {
      for (let i = 0; i < Math.round(seconds / 0.05); i++) {
        now += 50;
        a.seen = b.seen = now;
        if (full) room.tick(0.05);
        else room.tickHorror(0.05, [a, b]);
      }
    },
  };
}

test("Room intercepts the staged scare into a private hunt and preserves normal players and saved worlds", () => {
  const s = server();
  s.room.horror.tick(0.05, s.room.horrorContexts([s.a, s.b]));
  Object.assign(s.room.horror.states.get("a")!, { age: 310, stage: 5, nextAt: 310 });
  s.messages.length = 0;
  s.step(0.1);
  assert.equal(s.room.horrorHunt.view("a")[0].phase, "telegraph");
  assert(s.messages.some((m) => m.id === "a" && m.data.type === "horrorHunt"));
  assert.equal(
    s.messages.some((m) => m.id === "b" && ["horrorHunt", "horror", "award"].includes(m.data.type)),
    false,
  );
  assert.equal(
    s.messages.some((m) => m.data.type === "horror" && m.data.event.kind === "jumpscare"),
    false,
  );
  assert.equal(s.a.health, 20);
  assert.deepEqual(s.room.edits(), {});
  const restored = new Room(() => {});
  restored.restore(s.room.save());
  assert.equal(restored.horrorHunt.hunts.size, 0);
  assert.equal(restored.horror.states.get("a")!.stage, s.room.horror.states.get("a")!.stage);
});

test("Authoritative grab sends caught scare before death, protects its duration, and drops inventory exactly once", () => {
  const s = server(),
    wire = s.room.horrorHunt.start(trigger(), s.room.horrorContexts([s.a, s.b]), flat)!;
  const state = s.room.horrorHunt.hunts.get(wire.id)!;
  state.p = [0, 50, -1];
  state.lungeFrom = [...state.p];
  state.lungeTo = [0, 50, 0];
  state.phase = "lunge";
  state.phaseDuration = 0.55;
  s.a.profile.inventory = { 3: 12, 110: 2 };
  s.messages.length = 0;
  while (String(state.phase) !== "caught") s.step(0.05);
  assert.equal(s.a.health, 20);
  const scare = s.messages.find(
    (m) => m.data.type === "horror" && m.data.event.reason === "caught",
  )!;
  assert(scare);
  assert.equal(scare.id, "a");
  assert.equal(scare.data.event.duration, 1.3);
  assert.equal(scare.data.event.at, s.room.horror.elapsed);
  s.room.damage(s.a, 50, [0, 0, 0], "pvp");
  assert.equal(s.a.health, 20);
  s.room.input("a", { p: s.a.p, dimension: s.a.dimension, active: false });
  assert.equal(
    s.messages.some((m) => m.data.type === "horrorReset"),
    false,
  );
  s.step(1.25);
  assert.equal(s.a.health, 20);
  s.step(0.05);
  assert.equal(s.a.health, 0);
  assert.equal(s.b.health, 20);
  assert.deepEqual(s.a.profile.inventory, {});
  const drops = s.room.drops.reduce((n, d) => n + d.n, 0);
  assert.equal(drops, 14);
  s.step(4);
  assert.equal(
    s.room.drops.reduce((n, d) => n + d.n, 0),
    drops,
  );
  assert.equal(
    s.messages.filter((m) => m.id === "a" && m.data.type === "damage" && m.data.health === 0)
      .length,
    1,
  );
  assert.equal(
    s.messages.some((m) => m.id === "b" && ["horrorHunt", "horror", "award"].includes(m.data.type)),
    false,
  );
  s.room.command("a", { type: "respawn", req: "respawn" });
  assert.equal(s.a.health, 20);
  assert.deepEqual(s.a.profile.inventory, {});
});

test("Room melee command uses server weapon and stamina and deduplicates damage", () => {
  const s = server(),
    wire = s.room.horrorHunt.start(trigger(), s.room.horrorContexts([s.a, s.b]), flat)!;
  const state = s.room.horrorHunt.hunts.get(wire.id)!;
  state.p = [0, 50, -2];
  state.phase = "vulnerable";
  state.phaseDuration = 2.4;
  s.a.held = 104;
  const stats = weapon(s.a.held),
    before = state.hp;
  s.room.command("a", { type: "huntHit", target: state.id, req: "hit", damage: 99999 });
  assert.equal(state.hp, before - stats.damage * 1.45);
  assert.equal(s.a.stamina, 100 - stats.stamina);
  s.room.command("a", { type: "huntHit", target: state.id, req: "hit" });
  s.room.command("a", { type: "huntHit", target: state.id, req: "too-soon" });
  assert.equal(state.hp, before - stats.damage * 1.45);
  s.room.command("b", { type: "huntHit", target: state.id, req: "normal" });
  assert.equal(state.hp, before - stats.damage * 1.45);
  s.room.command("a", { type: "difficulty", difficulty: "normal", req: "leave-horror" });
  assert.equal(s.room.horrorHunt.view("a").length, 0);
});

test("Room simulates authoritative arrow flight against the Guest and consumes one projectile", () => {
  const s = server(),
    wire = s.room.horrorHunt.start(trigger(), s.room.horrorContexts([s.a]), flat)!;
  const state = s.room.horrorHunt.hunts.get(wire.id)!;
  state.p = [0, 50, -4];
  state.phase = "vulnerable";
  state.phaseDuration = 2.4;
  const w = s.room.region("overworld").world;
  for (let z = -10; z <= 1; z++) for (let y = 50; y <= 55; y++) w.set(0, y, z, 0);
  s.room.shots.push({
    p: new THREE.Vector3(0, 51.5, -2),
    v: new THREE.Vector3(0, 0, -37),
    owner: "a",
    dimension: "overworld",
    life: 5,
  });
  s.step(0.05, true);
  assert.equal(state.hp, 111);
  assert.equal(s.room.shots.length, 0);
  assert.equal(s.b.health, 20);
});
