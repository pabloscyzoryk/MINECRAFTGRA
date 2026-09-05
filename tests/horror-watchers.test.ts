import test from "node:test";
import assert from "node:assert/strict";
import { HorrorDirector, type HorrorContext } from "../lib/horror-director";

const player = (id: string, patch: Partial<HorrorContext> = {}): HorrorContext => ({
  id,
  p: [0, 20, 0],
  yaw: 0,
  pitch: 0,
  dimension: "overworld",
  difficulty: "horror",
  active: true,
  alive: true,
  night: false,
  underground: false,
  ...patch,
});
function quietWindow(contexts: HorrorContext[]) {
  const director = new HorrorDirector(423);
  director.tick(0.1, contexts);
  Object.assign(director.states.get("me")!, { age: 140, stage: 3, nextAt: 180, nextWatch: 140 });
  return director;
}
test("Quiet watchers stay distant, harmless and shared only with nearby eligible players", () => {
  const contexts = [
    player("me"),
    player("friend", { p: [5, 20, 0] }),
    player("normal", { difficulty: "normal" }),
    player("far", { p: [100, 20, 0] }),
    player("away", { dimension: "nether" }),
    player("paused", { active: false }),
  ];
  const director = quietWindow(contexts);
  const events = director.tick(0.1, contexts);
  const event = events.find((e) => e.reason === "passive-watch")!;
  assert(event);
  assert.equal(event.kind, "watcher");
  assert.deepEqual(event.viewerIds, ["me", "friend"]);
  const distance = Math.hypot(event.p[0], event.p[2]);
  assert(distance >= 26 && distance <= 36);
  assert(event.duration >= 12 && event.duration <= 17);
  assert.equal(director.states.get("me")!.stage, 3);
  assert.equal(director.states.get("me")!.nextAt, 180);
  assert(!events.some((e) => e.kind === "jumpscare"));
  assert.equal(director.tick(0.1, contexts).filter((e) => e.reason === "passive-watch").length, 0);
});
test("A distant watcher disappears after a deliberate look, rather than chasing the observer", () => {
  const me = player("me"),
    director = quietWindow([me]);
  const watcher = director.tick(0.1, [me]).find((e) => e.reason === "passive-watch")!;
  const position = [...watcher.p];
  me.yaw = Math.atan2(-watcher.p[0], -watcher.p[2]);
  assert.equal(
    director.tick(0.5, [me]).some((e) => e.kind === "vanish"),
    false,
  );
  const vanish = director.tick(0.5, [me]).find((e) => e.kind === "vanish");
  assert.equal(vanish?.targetId, watcher.id);
  assert.deepEqual(watcher.p, position);
  assert.equal(director.activeEvents.has(watcher.id), false);
});
test("Paused horror progression and normal difficulty do not schedule passive watchers", () => {
  for (const patch of [{ active: false }, { difficulty: "normal" as const }, { alive: false }]) {
    const me = player("me"),
      director = quietWindow([me]);
    Object.assign(me, patch);
    for (let i = 0; i < 100; i++) assert.equal(director.tick(0.5, [me]).length, 0);
    assert.equal(director.states.get("me")!.age, 140);
  }
});
