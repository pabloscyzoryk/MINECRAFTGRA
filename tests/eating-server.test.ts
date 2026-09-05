import test from "node:test";
import assert from "node:assert/strict";
import { Room } from "../server/room";
import { Gateway } from "../server/gateway";
import { InventoryPack } from "../lib/inventory";
import { touchesCactus } from "../lib/cactus-contact";
import { playerBox, type BlockBox } from "../lib/block-shapes";

function setup() {
  let now = 1000000,
    serial = 0;
  const messages: { id: string; data: any }[] = [];
  const room = new Room(
    (id, data) => messages.push({ id, data }),
    () => now,
  );
  room.populate = () => {};
  room.tickHorror = () => {};
  room.join("a", "Alicja", undefined);
  const player = room.players.get("a")!;
  player.p = [20.5, 50, 20.5];
  player.active = true;
  player.health = 12;
  player.healed = now;
  player.spawnUntil = player.hurtUntil = 0;
  player.profile.food = 8;
  const pack = new InventoryPack();
  pack.slots[0] = { id: 106, n: 3 };
  pack.slots[1] = { id: 107, n: 2 };
  player.profile.pack = pack.snapshot();
  player.profile.inventory = pack.counts();
  player.held = 106;
  const world = room.ensure("overworld", 20, 20);
  for (let x = 18; x <= 25; x++)
    for (let z = 17; z <= 23; z++) {
      world.set(x, 49, z, 3);
      for (let y = 50; y <= 54; y++) world.set(x, y, z, 0);
    }
  const input = (extra: Record<string, unknown> = {}) =>
    room.input("a", {
      p: player.p,
      dimension: player.dimension,
      yaw: 0,
      pitch: 0,
      active: true,
      usingFood: true,
      held: player.held,
      ...extra,
    });
  const command = (type: string, extra: Record<string, unknown> = {}) => {
    const req = String(extra.req ?? "food-" + serial++);
    room.command("a", { type, ...extra, req });
    return [...messages].reverse().find((m) => m.id === "a" && m.data.req === req)!.data;
  };
  return {
    room,
    player,
    world,
    messages,
    input,
    command,
    time(ms: number) {
      now += ms;
    },
    hold(ms: number) {
      while (ms > 0) {
        const step = Math.min(ms, 200);
        now += step;
        ms -= step;
        input();
      }
    },
    tick(ms = 50, simulationDt = ms / 1000) {
      now += ms;
      player.seen = now;
      room.tick(simulationDt);
    },
    start() {
      input();
      return command("eatStart");
    },
  };
}

test("Eating requires 1.6 real seconds of held use, consumes one item, adds only hunger, and deduplicates finish", () => {
  const s = setup(),
    start = s.start();
  assert.equal(start.ok, true);
  assert.equal(start.eatSession, start.req);
  assert.deepEqual(start.eating, { id: 106, progress: 0 });
  assert.equal(s.command("eat").ok, false, "legacy instant-eat route is closed");
  s.hold(1000);
  const early = s.command("eatFinish", { session: start.eatSession });
  assert.equal(early.ok, false);
  assert.equal(early.retryAfterMs, 600);
  assert.equal(s.player.foodUse?.session, start.eatSession);
  assert.equal((s.player.profile.inventory as any)[106], 3);
  assert.equal(s.room.publicPlayer(s.player).eating!.progress, 0.625);
  s.hold(600);
  const finish = s.command("eatFinish", { session: start.eatSession, req: "finish" });
  assert.equal(finish.ok, true);
  assert.equal(finish.eaten, 106);
  assert.equal(finish.food, 14);
  assert.equal(s.player.health, 12, "food does not instantly heal the player");
  assert.equal((s.player.profile.inventory as any)[106], 2);
  assert.equal(s.room.publicPlayer(s.player).eating, null);
  const next = s.start();
  assert.deepEqual(s.command("eatFinish", { session: start.eatSession, req: "finish" }), finish);
  assert.equal(
    s.player.foodUse?.session,
    next.eatSession,
    "old duplicate ACK leaves a new bite alone",
  );
  assert.equal((s.player.profile.inventory as any)[106], 2);
});

test("Release, switching food, pause, travel, a missing heartbeat, and attacks break uninterrupted eating", () => {
  const variants: ((s: ReturnType<typeof setup>) => void)[] = [
    (s) => s.input({ usingFood: false }),
    (s) => s.input({ held: 107 }),
    (s) => s.input({ active: false }),
    (s) => s.input({ dimension: "nether" }),
    (s) => {
      s.time(751);
      s.input();
    },
    (s) => {
      s.command("hit", { mob: "absent" });
    },
  ];
  for (const interrupt of variants) {
    const s = setup(),
      start = s.start();
    s.hold(1000);
    interrupt(s);
    assert.equal(s.player.foodUse, undefined);
    assert.ok(
      s.messages.some(
        (m) =>
          m.data.type === "eating" && m.data.state === null && m.data.session === start.eatSession,
      ),
    );
    s.hold(1000);
    assert.equal(s.command("eatFinish", { session: start.eatSession }).ok, false);
    assert.equal((s.player.profile.inventory as any)[106], 3);
    assert.equal(s.player.profile.food, 8);
  }
});

test("Eating cannot finish from just a start and timer, and tick clears stale actions", () => {
  const s = setup(),
    start = s.start();
  s.time(1600);
  assert.equal(s.command("eatFinish", { session: start.eatSession }).ok, false);
  assert.equal((s.player.profile.inventory as any)[106], 3);
  s.start();
  s.tick(800, 0.05);
  assert.equal(s.player.foodUse, undefined);
});

test("A canceled session cannot cancel or complete a new one and hunger cannot exceed twenty", () => {
  const s = setup(),
    first = s.start();
  s.command("eatCancel", { session: first.eatSession });
  s.player.profile.food = 18;
  s.player.held = 107;
  const second = s.start();
  s.command("eatCancel", { session: first.eatSession });
  assert.equal(s.player.foodUse?.session, second.eatSession);
  assert.equal(s.command("eatFinish", { session: first.eatSession }).ok, false);
  s.hold(1600);
  const finish = s.command("eatFinish", { session: second.eatSession });
  assert.equal(finish.food, 20);
  assert.equal((s.player.profile.inventory as any)[107], 1);
  assert.equal(s.start().ok, false, "full hunger cannot spend food");
});

test("Food ownership is checked at start and finish; reconnect/save never resumes an old bite", () => {
  const s = setup();
  s.input({ held: 103 });
  assert.equal(s.command("eatStart").ok, false);
  s.player.held = 106;
  const start = s.start();
  const save = s.room.save();
  assert.equal(save.players[0].foodUse, undefined);
  assert.equal(save.players[0].usingFood, false);
  const restored = new Room(() => {}, s.room.now);
  restored.restore(save);
  assert.equal(restored.players.get("a")!.foodUse, undefined);
  assert.equal(restored.publicPlayer(restored.players.get("a")!).eating, null);
  s.hold(1600);
  (s.player.profile.inventory as any)[106] = 0;
  assert.equal(s.command("eatFinish", { session: start.eatSession }).ok, false);
  s.player.held = 107;
  s.start();
  s.room.join("a", "Alicja", undefined);
  assert.equal(s.player.foodUse, undefined);
});

test("Death and actual gateway leave immediately cancel eating without consuming it", () => {
  const s = setup();
  s.start();
  const gateway = Object.create(Gateway.prototype) as any;
  gateway.room = s.room;
  gateway.handle({ type: "leave", id: "a", data: null });
  assert.equal(s.player.foodUse, undefined);
  assert.equal(s.player.usingFood, false);
  assert.equal((s.player.profile.inventory as any)[106], 3);
  s.room.join("a", "Alicja", undefined);
  s.player.held = 106;
  s.start();
  s.room.damage(s.player, 100);
  assert.equal(s.player.foodUse, undefined);
  assert.equal(
    s.room.drops.filter((d) => d.id === 106).reduce((n, d) => n + d.n, 0),
    3,
  );
});

test("Cactus thorns hurt only at the actual body boundary including top, with no proximity radius", () => {
  const get = (x: number, y: number, z: number) => (x === 0 && y === 0 && z === 0 ? 41 : 0);
  const box = (x: number, y = 0, z = 0.5, height = 1.75) => playerBox({ x, y, z }, height);
  assert.equal(touchesCactus(get, box(-0.31)), false, "two centimeters of air is safe");
  assert.equal(touchesCactus(get, box(-0.29)), true, "side thorns reach the voxel boundary");
  assert.equal(touchesCactus(get, box(0.5, 1)), true, "standing on top hurts");
  assert.equal(touchesCactus(get, box(0.5, 1.03)), false);
  assert.equal(touchesCactus(get, box(-0.31, 0, -0.31)), false, "diagonal proximity does not hurt");
  assert.equal(
    touchesCactus(get, box(0.5, -1.5, 0.5, 1.45)),
    false,
    "crouched head stays below thorns",
  );
  assert.equal(touchesCactus(get, box(0.5, -1.5)), true);
  assert.equal(
    touchesCactus(() => 3, box(0.5)),
    false,
  );
  assert.equal(touchesCactus(get, [NaN, 0, 0, 1, 1, 1] as BlockBox), false);
});

test("Server contact damage works while a panel is open, respects 800 ms immunity, and stops on separation", () => {
  const s = setup();
  s.player.health = 20;
  s.player.active = false;
  s.world.set(21, 50, 20, 41);
  s.player.p = [20.69, 50, 20.5];
  s.tick();
  assert.equal(s.player.health, 20);
  s.player.p[0] = 20.71;
  s.tick();
  assert.equal(s.player.health, 19);
  assert.equal(s.messages.filter((m) => m.data.type === "damage").at(-1)!.data.reason, "cactus");
  s.tick(799, 0.05);
  assert.equal(s.player.health, 19);
  s.tick(1, 0.05);
  assert.equal(s.player.health, 18);
  s.player.p[0] = 20.65;
  s.tick(1000, 0.05);
  assert.equal(s.player.health, 18);
  s.player.p = [21.5, 51, 20.5];
  s.tick();
  assert.equal(s.player.health, 17);
  s.world.set(21, 50, 20, 0);
  s.tick(1000, 0.05);
  assert.equal(s.player.health, 17);
  assert.equal(
    s.command("environmentDamage", { reason: "cactus", amount: 10 }).ok,
    false,
    "clients cannot double-report server-owned contact",
  );
});

test("Bed rest skips night after ten real seconds even when gateway simulation steps are clamped", () => {
  const s = setup();
  s.player.held = 0;
  s.world.set(22, 50, 20, 190);
  s.world.set(22, 50, 19, 194);
  s.room.clock = 400;
  assert.equal(s.command("use", { x: 22, y: 50, z: 20 }).ok, true);
  s.player.active = false;
  for (let i = 0; i < 9; i++) s.tick(1000, 0.05);
  assert.equal(s.player.bedRest!.elapsed, 9);
  assert.ok(s.room.clock < 600);
  s.tick(1000, 0.05);
  assert.equal(s.player.bedRest!.elapsed, 10);
  assert.equal(s.player.bedRest!.nightSkipped, true);
  assert.ok(s.room.clock >= 690);
  assert.equal(s.room.save().players[0].bedStartedAt, undefined);
});
