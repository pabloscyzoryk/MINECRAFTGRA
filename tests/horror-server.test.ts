import test from "node:test";
import assert from "node:assert/strict";
import { DIFFICULTIES, normalizeDifficulty, difficultyRules } from "../lib/difficulty";
import { HorrorDirector, type HorrorContext, type HorrorEvent } from "../lib/horror-director";
import { Room } from "../server/room";

const context = (id = "a", options: Partial<HorrorContext> = {}): HorrorContext => ({
  id,
  p: [0, 20, 0],
  yaw: 0,
  pitch: 0,
  dimension: "overworld",
  difficulty: "horror",
  active: true,
  alive: true,
  night: true,
  underground: false,
  ...options,
});
function advance(director: HorrorDirector, seconds: number, contexts: HorrorContext[]) {
  const events: HorrorEvent[] = [];
  for (let t = 0; t < seconds; t++) events.push(...director.tick(1, contexts));
  return events;
}
function setup() {
  let now = 100000;
  const messages: { id: string; data: any }[] = [],
    room = new Room(
      (id, data) => messages.push({ id, data }),
      () => now,
    );
  room.populate = () => {};
  return {
    room,
    messages,
    step(dt: number) {
      now += dt * 1000;
      room.tick(dt);
    },
    time(dt: number) {
      now += dt * 1000;
    },
  };
}

test("Difficulty sanitization defaults old profiles to normal and provides ordered survival scaling", () => {
  for (const value of [null, undefined, "peaceful", {}, 4])
    assert.equal(normalizeDifficulty(value), "normal");
  for (const value of DIFFICULTIES) assert.equal(normalizeDifficulty(value), value);
  assert(difficultyRules("easy").environmentDamage < difficultyRules("normal").environmentDamage);
  assert(difficultyRules("hard").environmentDamage > difficultyRules("normal").environmentDamage);
  assert(difficultyRules("horror").hungerRate > difficultyRules("normal").hungerRate);
  assert(difficultyRules("easy").regenerationSeconds < difficultyRules("hard").regenerationSeconds);
});

test("Horror builds for minutes before a strong scare and then provides recovery", () => {
  const director = new HorrorDirector(7),
    events = advance(director, 390, [context()]);
  const first = (kind: HorrorEvent["kind"]) => events.find((e) => e.kind === kind)!;
  assert(first("whisper").at >= 45 && first("whisper").at <= 75);
  assert(first("watcher").at >= 120 && first("watcher").at <= 180);
  assert(first("silhouette").at > first("watcher").at);
  assert(first("approach").at > first("silhouette").at);
  assert(first("jumpscare").at >= 300 && first("jumpscare").at <= 360);
  assert(first("recovery").at > first("jumpscare").at);
  assert(events.every((e) => e.duration > 0 && e.intensity >= 0 && e.intensity <= 1));
  assert.equal(events.filter((e) => e.kind === "jumpscare").length, 1);
});

test("No horror events or tension accrue for ordinary players, menus, hidden clients or dead players", () => {
  const director = new HorrorDirector();
  assert.deepEqual(
    advance(director, 400, [
      context("normal", { difficulty: "normal" }),
      context("paused", { active: false }),
      context("dead", { alive: false }),
      context("easy", { difficulty: "easy" }),
    ]),
    [],
  );
  assert.equal(director.states.size, 0);
  const c = context("paused");
  advance(director, 30, [c]);
  const before = director.states.get(c.id)!.age;
  advance(director, 200, [{ ...c, active: false }]);
  assert.equal(director.states.get(c.id)!.age, before);
  assert.equal(advance(director, 10, [c]).length, 0);
});

test("Night, underground isolation increase tension without depending on the day clock", () => {
  const mild = new HorrorDirector(),
    severe = new HorrorDirector();
  advance(mild, 30, [
    context("a", { night: false }),
    context("friend", { difficulty: "normal", p: [2, 20, 0] }),
  ]);
  advance(severe, 30, [context("a", { night: true, underground: true })]);
  assert(severe.states.get("a")!.tension > mild.states.get("a")!.tension);
  assert.equal(mild.elapsed, 30);
  assert.equal(severe.elapsed, 30);
});

test("Nearby opted-in players share one watcher; looking at it makes it disappear", () => {
  const director = new HorrorDirector(),
    a = context("a"),
    b = context("b", { p: [2, 20, 0] }),
    ordinary = context("normal", { difficulty: "normal" });
  director.tick(1, [a, b, ordinary]);
  for (const id of ["a", "b"])
    Object.assign(director.states.get(id)!, { age: 150, stage: 2, nextAt: 150 });
  const watcher = director.tick(0.5, [a, b, ordinary]).find((e) => e.kind === "watcher")!;
  assert(watcher);
  assert.deepEqual(new Set(watcher.viewerIds), new Set(["a", "b"]));
  const dx = watcher.p[0] - a.p[0],
    dz = watcher.p[2] - a.p[2];
  a.yaw = Math.atan2(-dx, -dz);
  const vanish = director.tick(0.5, [a, b, ordinary]).find((e) => e.kind === "vanish")!;
  assert.equal(vanish.targetId, watcher.id);
  assert.equal(vanish.reason, "looked");
  assert.equal(director.activeEvents.has(watcher.id), false);
});

test("Checkpoint preserves escalation but drops real-time apparitions and gives a restart grace period", () => {
  const old = new HorrorDirector(),
    c = context();
  advance(old, 151, [c]);
  const saved = old.save(),
    next = new HorrorDirector();
  next.restore(saved);
  assert.equal(next.states.get(c.id)!.stage, old.states.get(c.id)!.stage);
  assert.equal(next.activeEvents.size, 0);
  assert.equal(next.elapsed, old.elapsed);
  assert.equal(advance(next, 29, [c]).length, 0);
  next.reset(c.id);
  assert.equal(advance(next, 44, [c]).length, 0);
});

test("One public room keeps per-player difficulty, ignores profile injection and persists choices", () => {
  const s = setup();
  s.room.join("a", "Alicja", undefined, "horror");
  s.room.join("b", "Bartek", undefined, "easy");
  s.room.join("c", "Celina", undefined, "invalid");
  assert.equal(s.room.players.size, 3);
  assert.equal(s.room.players.get("a")!.difficulty, "horror");
  assert.equal(s.room.players.get("c")!.difficulty, "normal");
  s.room.profile("a", { difficulty: "easy", food: 100 });
  assert.equal(s.room.players.get("a")!.profile.difficulty, "horror");
  assert.equal(s.room.players.get("a")!.profile.food, 20);
  s.room.command("b", { type: "difficulty", difficulty: "hard", req: "hard-choice" });
  assert.equal(s.messages.at(-1)!.data.difficulty, "hard");
  const restored = new Room(() => {});
  restored.restore(s.room.save());
  assert.equal(restored.players.get("a")!.difficulty, "horror");
  assert.equal(restored.players.get("b")!.difficulty, "hard");
  assert.equal(restored.players.get("a")!.active, false);
});

test("PvP damage is identical across difficulty levels while environmental damage scales", () => {
  const s = setup();
  for (const difficulty of DIFFICULTIES)
    s.room.join(difficulty, difficulty + "_player", undefined, difficulty);
  const health: number[] = [];
  for (const p of s.room.players.values()) {
    s.room.damage(p, 4, [0, 0, 0], "pvp");
    assert.equal(p.health, 16);
    p.health = 20;
    p.hurtUntil = 0;
    s.room.damage(p, 4);
    health.push(p.health);
  }
  assert(health[0] > health[1] && health[1] > health[2] && health[2] > health[3]);
});

test("Server hunger and regeneration follow personal difficulty; combat uses common rates", () => {
  const s = setup();
  for (const difficulty of ["easy", "hard"] as const) {
    s.room.join(difficulty, difficulty + "_player", undefined, difficulty);
    const p = s.room.players.get(difficulty)!;
    p.active = true;
    p.moving = true;
    p.health = 15;
    p.healed = 100000;
  }
  for (let i = 0; i < 30; i++) {
    for (const p of s.room.players.values()) p.seen = s.room.now();
    s.step(1);
  }
  const easy = s.room.players.get("easy")!,
    hard = s.room.players.get("hard")!;
  assert(Number(easy.profile.food) > Number(hard.profile.food));
  assert(easy.health > hard.health);
  for (const p of [easy, hard]) {
    p.hungerClock = 0;
    p.pvpUntil = s.room.now() + 20000;
  }
  s.step(1);
  assert.equal(easy.hungerClock, hard.hungerClock);
});

test("Server waits for active input and only delivers horror to consenting players", () => {
  const s = setup();
  s.room.join("a", "Alicja", undefined, "horror");
  s.room.join("b", "Bartek", undefined, "normal");
  const a = s.room.players.get("a")!,
    b = s.room.players.get("b")!;
  for (let i = 0; i < 100; i++) s.room.tickHorror(1, [a, b]);
  assert.equal(s.room.horror.states.size, 0);
  s.room.input("a", { p: a.p, dimension: a.dimension, active: true });
  s.room.input("b", { p: b.p, dimension: b.dimension, active: true });
  for (let i = 0; i < 80; i++) s.room.tickHorror(1, [a, b]);
  const events = s.messages.filter((m) => m.data.type === "horror");
  assert(events.length > 0);
  assert(
    events.every((m) => m.id === "a" && m.data.event.viewerIds.every((id: string) => id === "a")),
  );
  const edits = s.room.edits();
  assert.deepEqual(edits, {});
  assert.equal(s.room.drops.length, 0);
  const age = s.room.horror.states.get("a")!.age;
  s.room.input("a", { p: a.p, dimension: a.dimension, active: false });
  for (let i = 0; i < 60; i++) s.room.tickHorror(1, [a, b]);
  assert.equal(s.room.horror.states.get("a")!.age, age);
});

test("Apparitions stand on free ground and become sound when a cave has no safe space", () => {
  const s = setup(),
    world = s.room.region("overworld").world;
  const event: HorrorEvent = {
    id: "test",
    kind: "watcher",
    p: [30, 50, 30],
    at: 0,
    yaw: 0,
    duration: 5,
    intensity: 0.5,
    seed: 1,
    reason: "night",
    viewerIds: ["a"],
    dimension: "overworld",
  };
  for (let x = 23; x <= 38; x++)
    for (let z = 23; z <= 38; z++) {
      world.set(x, 49, z, 3);
      for (let y = 50; y <= 65; y++) world.set(x, y, z, 0);
    }
  s.room.placeHorrorEvent(event, [28, 50, 28], false);
  assert.equal(event.kind, "watcher");
  assert.equal(event.p[1], 50);
  assert(world.solid(event.p[0], event.p[1] - 0.05, event.p[2]));
  for (let x = 23; x <= 38; x++)
    for (let z = 23; z <= 38; z++) for (let y = 45; y <= 56; y++) world.set(x, y, z, 3);
  const blocked = { ...event, p: [30, 50, 30] as [number, number, number] };
  s.room.placeHorrorEvent(blocked, [28, 50, 28], true);
  assert.equal(blocked.kind, "knock");
  assert.equal(blocked.reason, "obstructed");
});
