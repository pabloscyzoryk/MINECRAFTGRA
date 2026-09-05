import test from "node:test";
import assert from "node:assert/strict";
import { Room } from "../server/room";
import { InventoryPack, type Stack } from "../lib/inventory";
import {
  createFurnace,
  restoreFurnace,
  tickFurnace,
  furnaceFuelSeconds,
  furnaceRecipe,
  canInsertFurnaceSlot,
  type FurnaceState,
} from "../lib/furnace";
import type { InventoryGesture } from "../lib/inventory-gestures";
import { Multiplayer } from "../lib/multiplayer";

function loaded(input = 21, n = 8, fuel = 109, fuelN = 1) {
  const state = createFurnace();
  state.slots = [{ id: input, n }, { id: fuel, n: fuelN }, null];
  return state;
}
function totals(stacks: (Stack | null)[]) {
  const counts: Record<number, number> = {};
  for (const stack of stacks) if (stack) counts[stack.id] = (counts[stack.id] ?? 0) + stack.n;
  return counts;
}
function setup() {
  const messages: { id: string; data: any }[] = [],
    room = new Room(
      (id, data) => messages.push({ id, data }),
      () => 100000,
    );
  const key = "overworld:30,51,29";
  room.join("a", "Alicja", undefined);
  room.join("b", "Bartek", undefined);
  for (const p of room.players.values()) p.p = [30, 50, 30];
  room.ensure("overworld", 30, 30).set(30, 51, 29, 29);
  let sequence = 0;
  const command = (id: string, data: Record<string, unknown>) => {
    const req = String(data.req ?? "furnace-" + ++sequence);
    room.command(id, {
      baseRevision: Number(room.players.get(id)!.profile.inventoryRevision) || 0,
      ...data,
      req,
    } as any);
    return messages
      .slice()
      .reverse()
      .find((m) => m.id === id && m.data.req === req)!.data;
  };
  for (const id of ["a", "b"]) assert(command(id, { type: "openFurnace", x: 30, y: 51, z: 29 }).ok);
  const install = (pack: InventoryPack, id = "a") => {
    const p = room.players.get(id)!;
    p.profile.pack = pack.snapshot();
    p.profile.inventory = pack.counts();
  };
  const gesture = (value: InventoryGesture, id = "a") =>
    command(id, { type: "inventoryGesture", furnaceKey: key, chestKey: null, gesture: value });
  return { room, key, command, gesture, install, messages };
}

test("Furnace recipes and fuel durations match the game materials", () => {
  assert.equal(furnaceFuelSeconds(109), 80);
  for (const id of [5, 8, 25, 43, 44, 47, 49, 51, 52, 76, 78, 86])
    assert.equal(furnaceFuelSeconds(id), 15);
  assert.equal(furnaceFuelSeconds(112), 5);
  assert.equal(furnaceFuelSeconds(3), 0);
  for (const [input, output] of [
    [21, 110],
    [80, 120],
    [4, 10],
    [9, 3],
  ])
    assert.deepEqual(furnaceRecipe(input), { input, output, seconds: 10 });
  assert(canInsertFurnaceSlot(0, 108), "Manual input can hold an item without a smelting recipe");
  assert.equal(canInsertFurnaceSlot(1, 108), false);
  assert.equal(canInsertFurnaceSlot(2, 110), false);
});

test("A coal piece smelts exactly eight items over eighty seconds", () => {
  const state = loaded();
  tickFurnace(state, 9.5);
  assert.equal(state.slots[2], null);
  assert.equal(state.slots[1], null);
  tickFurnace(state, 0.5);
  assert.deepEqual(state.slots[2], { id: 110, n: 1 });
  assert.equal(state.burnRemaining, 70);
  tickFurnace(state, 30);
  tickFurnace(state, 30);
  tickFurnace(state, 10);
  assert.equal(state.slots[0], null);
  assert.deepEqual(state.slots[2], { id: 110, n: 8 });
  assert.equal(state.burnRemaining, 0);
  assert.equal(state.progress, 0);
});

test("Two sticks bridge one recipe while missing fuel cools partial progress", () => {
  const enough = loaded(4, 1, 112, 2);
  tickFurnace(enough, 10);
  assert.deepEqual(enough.slots, [null, null, { id: 10, n: 1 }]);
  const short = loaded(4, 1, 112, 1);
  tickFurnace(short, 5);
  assert.equal(short.progress, 5);
  tickFurnace(short, 1);
  assert.equal(short.progress, 3);
  assert.equal(short.slots[2], null);
  assert.deepEqual(short.slots[0], { id: 4, n: 1 });
});

test("A blocked output does not ignite new fuel or consume input; an existing fire still burns", () => {
  const state = loaded();
  state.slots[2] = { id: 110, n: 64 };
  tickFurnace(state, 20);
  assert.deepEqual(state.slots[1], { id: 109, n: 1 });
  assert.deepEqual(state.slots[0], { id: 21, n: 8 });
  assert.equal(state.progress, 0);
  state.burnTotal = state.burnRemaining = 80;
  tickFurnace(state, 5);
  assert.equal(state.burnRemaining, 75);
  assert.deepEqual(state.slots[1], { id: 109, n: 1 });
  assert.equal(state.progress, 0);
});

test("Changing input resets its partial recipe, and invalid input cannot burn fuel", () => {
  const state = loaded();
  tickFurnace(state, 5);
  state.slots[0] = { id: 80, n: 1 };
  tickFurnace(state, 5);
  assert.equal(state.progress, 5);
  assert.equal(state.slots[2], null);
  tickFurnace(state, 5);
  assert.deepEqual(state.slots[2], { id: 120, n: 1 });
  const invalid = loaded(108, 1);
  assert.equal(tickFurnace(invalid, 30), false);
  assert.deepEqual(invalid.slots[1], { id: 109, n: 1 });
});

test("Furnace restore preserves progress and limits suspended-frame catchup", () => {
  const before = loaded();
  tickFurnace(before, 4);
  const restored = restoreFurnace(JSON.parse(JSON.stringify(before)));
  assert.deepEqual(restored, before);
  tickFurnace(restored, 6);
  assert.deepEqual(restored.slots[2], { id: 110, n: 1 });
  const longFrame = loaded();
  tickFurnace(longFrame, 86400);
  assert.deepEqual(longFrame.slots[2], { id: 110, n: 3 });
  assert.equal(longFrame.burnRemaining, 50);
  assert.deepEqual(
    restoreFurnace({ slots: [{ id: 999, n: Infinity }], burnRemaining: Infinity }),
    createFurnace(),
  );
});

test("Authoritative furnace gestures conserve items and enforce fuel and output restrictions", () => {
  const s = setup(),
    pack = new InventoryPack();
  pack.slots[0] = { id: 21, n: 8 };
  pack.slots[1] = { id: 109, n: 2 };
  s.install(pack);
  assert(
    s.gesture({
      type: "move",
      from: { area: "slots", index: 0 },
      to: { area: "furnace", index: 0 },
    }).ok,
  );
  assert(
    s.gesture({
      type: "move",
      from: { area: "slots", index: 1 },
      to: { area: "furnace", index: 1 },
    }).ok,
  );
  assert.deepEqual(totals(s.room.furnaces[s.key].slots), { 21: 8, 109: 2 });
  assert.deepEqual(s.room.players.get("a")!.profile.inventory, {});
  const invalid = new InventoryPack();
  invalid.cursor = { id: 3, n: 7 };
  s.install(invalid);
  assert.equal(s.gesture({ type: "click", slot: { area: "furnace", index: 1 } }).ok, false);
  assert.equal(s.gesture({ type: "click", slot: { area: "furnace", index: 2 } }).ok, false);
  assert.deepEqual((s.room.players.get("a")!.profile.pack as any).cursor, { id: 3, n: 7 });
});

test("Furnace output is taken by at most one player and a stale drag cannot take a replacement", () => {
  const s = setup();
  s.room.furnaces[s.key].slots[2] = { id: 110, n: 10 };
  assert(s.gesture({ type: "click", slot: { area: "furnace", index: 2 } }, "a").ok);
  assert.equal(
    s.gesture(
      {
        type: "move",
        from: { area: "furnace", index: 2 },
        to: { area: "slots", index: 0 },
        expected: { id: 110, n: 10 },
      },
      "b",
    ).ok,
    false,
  );
  assert.deepEqual((s.room.players.get("a")!.profile.pack as any).cursor, { id: 110, n: 10 });
  assert.equal((s.room.players.get("b")!.profile.inventory as any)[110] ?? 0, 0);
  assert.equal(s.room.furnaces[s.key].slots[2], null);
});

test("Furnace ACK cache remains immutable and duplicate requests do not take output twice", () => {
  const s = setup();
  s.room.furnaces[s.key].slots[2] = { id: 110, n: 10 };
  const c = {
    type: "inventoryGesture",
    req: "output-once",
    furnaceKey: s.key,
    chestKey: null,
    gesture: { type: "click", slot: { area: "furnace", index: 2 } },
  };
  const first = s.command("a", c),
    frozen = structuredClone(first);
  s.room.furnaces[s.key].slots[2] = { id: 110, n: 5 };
  s.room.furnaceRevisions[s.key]++;
  assert.deepEqual(s.command("a", c), frozen);
  assert.deepEqual(first, frozen);
  assert.deepEqual(s.room.furnaces[s.key].slots[2], { id: 110, n: 5 });
  assert.equal((s.room.players.get("a")!.profile.inventory as any)[110], 10);
});

test("Loaded furnaces keep working after closing UI, notify both viewers, and pause when unloaded", () => {
  const s = setup();
  s.room.furnaces[s.key] = loaded();
  const players = [...s.room.players.values()];
  for (let i = 0; i < 200; i++) {
    s.room.tickId++;
    s.room.tickFurnaces(0.05, players);
  }
  assert.deepEqual(s.room.furnaces[s.key].slots[2], { id: 110, n: 1 });
  for (const id of ["a", "b"])
    assert(
      s.messages.some(
        (m) => m.id === id && m.data.type === "furnaceUpdate" && m.data.state.slots[2]?.n === 1,
      ),
    );
  for (const p of players)
    s.room.input(p.id, { p: p.p, dimension: p.dimension, active: true, furnaceKey: null });
  assert.equal(s.room.furnaceViewers.size, 0);
  const count = s.messages.length;
  s.room.tickFurnaces(10, players);
  assert.deepEqual(s.room.furnaces[s.key].slots[2], { id: 110, n: 2 });
  assert.equal(s.messages.length, count);
  for (const p of players) p.p = [300, 50, 300];
  const before = structuredClone(s.room.furnaces[s.key]);
  s.room.tickFurnaces(30, players);
  assert.deepEqual(s.room.furnaces[s.key], before);
});

test("Furnace persistence resumes remaining fuel/progress without offline production", () => {
  const s = setup();
  s.room.furnaces[s.key] = loaded(80, 4, 8, 2);
  s.room.tickFurnaces(6, [...s.room.players.values()]);
  const before = structuredClone(s.room.furnaces[s.key]),
    restored = new Room(() => {});
  restored.restore(JSON.parse(JSON.stringify(s.room.save())));
  assert.deepEqual(restored.furnaces[s.key], before);
  assert.equal(restored.furnaceViewers.size, 0);
  restored.tickFurnaces(86400, []);
  assert.deepEqual(restored.furnaces[s.key], before);
});

test("Breaking a furnace drops stored contents once and closes its viewers", () => {
  const s = setup();
  s.room.furnaces[s.key] = {
    ...createFurnace(),
    slots: [
      { id: 21, n: 2 },
      { id: 109, n: 1 },
      { id: 110, n: 3 },
    ],
  };
  const mined = s.command("a", {
    type: "mine",
    req: "break-once",
    x: 30,
    y: 51,
    z: 29,
    expected: 29,
  });
  assert.equal(mined.ok, true);
  assert.equal(s.room.furnaces[s.key], undefined);
  assert.deepEqual(totals(s.room.drops), { 21: 2, 109: 1, 110: 3 });
  assert.equal((s.room.players.get("a")!.profile.inventory as any)[29], 1);
  assert(
    s.messages.some(
      (m) => m.id === "b" && m.data.type === "furnaceUpdate" && m.data.state === null,
    ),
  );
  s.command("a", { type: "mine", req: "break-once", x: 30, y: 51, z: 29, expected: 29 });
  assert.equal(s.room.drops.length, 3);
});

test("Furnace gestures reject remote or cross-dimension containers without changing the pack", () => {
  const s = setup(),
    pack = new InventoryPack();
  pack.cursor = { id: 109, n: 2 };
  s.install(pack);
  const base = {
    type: "inventoryGesture",
    chestKey: null,
    gesture: { type: "click", slot: { area: "furnace", index: 1 } },
  };
  assert.equal(s.command("a", { ...base, furnaceKey: "nether:30,51,29" }).ok, false);
  s.room.players.get("a")!.p = [300, 50, 300];
  assert.equal(s.command("a", { ...base, furnaceKey: s.key }).ok, false);
  assert.deepEqual((s.room.players.get("a")!.profile.pack as any).cursor, { id: 109, n: 2 });
});

test("A furnace does not authorize 3x3 crafting and result destinations remain authoritative", () => {
  const s = setup(),
    pack = new InventoryPack();
  pack.size = 3;
  pack.grid[0] = { id: 5, n: 3 };
  s.install(pack);
  assert.equal(s.command("a", { type: "craft" }).ok, false);
  pack.size = 2;
  s.install(pack);
  for (const to of [
    { area: "furnace", index: 0 },
    { area: "result", index: 0 },
    { area: "slots", index: 40 },
  ]) {
    assert.equal(s.command("a", { type: "craft", to }).ok, false);
    assert.deepEqual(s.room.players.get("a")!.profile.pack, pack.snapshot());
  }
  assert(
    s.command("a", { type: "craft", to: { area: "slots", index: 10 }, expected: { id: 8, n: 4 } })
      .ok,
  );
  const result = s.room.players.get("a")!.profile.pack as any;
  assert.deepEqual(result.slots[10], { id: 8, n: 4 });
  assert.deepEqual(result.grid[0], { id: 5, n: 2 });
});

function furnaceClient() {
  const sent: any[] = [],
    pauses: string[] = [],
    pack = new InventoryPack();
  const game: any = {
    pack,
    inventory: {},
    hotbar: Array(9).fill(0),
    health: 20,
    active: true,
    started: true,
    preview: false,
    lockGeneration: 0,
    pauseReason: "",
    position: { x: 30, y: 50, z: 30 },
    world: { dimension: "overworld", get: () => 29, chunks: new Map() },
    adventure: {
      currentFurnace: "",
      data: { furnaces: {} as Record<string, FurnaceState> },
      furnaceState() {
        return this.data.furnaces[this.currentFurnace];
      },
    },
    emit() {},
    notify() {},
    setDifficulty() {},
    dimensionChanged() {},
    ensure() {},
    pause(reason: string) {
      this.lockGeneration++;
      this.pauseReason = reason;
      this.active = false;
      pauses.push(reason);
    },
    resume() {
      this.lockGeneration++;
      this.pauseReason = "";
      this.active = true;
    },
  };
  const net = Object.create(Multiplayer.prototype) as Multiplayer;
  Object.assign(net, {
    game,
    connected: true,
    initialized: true,
    closed: false,
    fatal: false,
    chestBusy: false,
    inventoryRevision: 0,
    inventoryQueue: [],
    furnaceOpenGeneration: 0,
    furnaceRefreshKey: null,
    furnaceRevisions: new Map(),
    chestRevisions: new Map(),
    pending: new Map(),
    applied: new Set(),
    listeners: new Set(),
    token: "a".repeat(64),
    sequence: 0,
    sendInput() {},
    sendProfile() {},
    send(data: any) {
      sent.push(structuredClone(data));
    },
  });
  const commands = () => sent.filter((message) => message.type === "command").map((m) => m.command);
  const answer = (command: any, state: FurnaceState | null, revision = 1, inventoryRevision = 1) =>
    net.receive({
      type: "result",
      req: command.req,
      ok: true,
      inventoryRevision,
      pack: pack.snapshot(),
      furnace: {
        key: "overworld:" + [command.x ?? 30, command.y ?? 51, command.z ?? 29],
        state,
        revision,
      },
    });
  return { net, game, commands, pauses, answer };
}

test("A late furnace-open ACK cannot reopen a destroyed furnace", () => {
  const c = furnaceClient(),
    key = "overworld:30,51,29";
  c.net.openFurnace(30, 51, 29);
  c.net.receive({ type: "furnaceUpdate", key, state: null, revision: 2 });
  c.answer(c.commands()[0], createFurnace(), 1);
  assert.equal(c.game.adventure.currentFurnace, "");
  assert.equal(c.game.adventure.data.furnaces[key], undefined);
  assert.deepEqual(c.pauses, []);
});

test("Furnace-open ACK respects death, another menu, dimension changes and session closure", () => {
  for (const invalidate of [
    (g: any) => {
      g.health = 0;
      g.pause("death");
    },
    (g: any) => g.pause("inventory"),
    (g: any) => {
      g.pause("inventory");
      g.resume();
    },
    (g: any) => {
      g.health = 0;
      g.pause("death");
      g.health = 20;
      g.resume();
    },
    (g: any) => {
      g.world.dimension = "nether";
    },
    (_g: any, net: Multiplayer) => {
      net.closed = true;
    },
  ]) {
    const c = furnaceClient();
    c.net.openFurnace(30, 51, 29);
    invalidate(c.game, c.net);
    c.answer(c.commands()[0], createFurnace());
    assert(!c.pauses.includes("furnace"));
    assert.equal(c.game.adventure.currentFurnace, "");
  }
  const c = furnaceClient();
  c.net.openFurnace(30, 51, 29);
  c.answer(c.commands()[0], createFurnace());
  assert.deepEqual(c.pauses, ["furnace"]);
  assert.equal(c.game.adventure.currentFurnace, "overworld:30,51,29");
});

test("Only the latest requested furnace can open its panel", () => {
  const c = furnaceClient();
  c.net.openFurnace(30, 51, 29);
  c.net.openFurnace(31, 51, 29);
  c.answer(c.commands()[0], createFurnace());
  assert.deepEqual(c.pauses, []);
  c.answer(c.commands()[1], createFurnace());
  assert.equal(c.game.adventure.currentFurnace, "overworld:31,51,29");
  assert.deepEqual(c.pauses, ["furnace"]);
});

test("Furnace updates ignore stale snapshots and destruction closes the current panel", () => {
  const c = furnaceClient(),
    key = "overworld:30,51,29",
    state = loaded();
  c.game.pause("furnace");
  c.game.adventure.currentFurnace = key;
  c.net.applyFurnace(key, state, 5);
  c.net.applyFurnace(key, createFurnace(), 4);
  assert.deepEqual(c.game.adventure.data.furnaces[key], restoreFurnace(state));
  c.net.applyFurnace(key, null, 6);
  assert.equal(c.game.pauseReason, "");
  assert.equal(c.game.adventure.currentFurnace, "");
  c.net.applyFurnace(key, state, 5);
  assert.equal(c.game.adventure.data.furnaces[key], undefined);
});

test("Welcome rebases furnace revisions and refreshes after an in-flight inventory ACK", () => {
  const c = furnaceClient(),
    key = "overworld:30,51,29";
  c.game.pause("furnace");
  c.game.adventure.currentFurnace = key;
  c.net.applyFurnace(key, loaded(), 100);
  c.net.inventoryGesture({ type: "click", slot: { area: "furnace", index: 0 } }, "furnace");
  const pending = c.commands()[0];
  c.net.receive({
    type: "welcome",
    id: "a",
    profile: { inventoryRevision: 1, pack: c.game.pack.snapshot() },
    health: 20,
    clock: 90,
    edits: {},
    water: {},
  });
  assert.equal(c.game.adventure.data.furnaces[key], undefined);
  assert.equal(c.net.furnaceRevisions.has(key), false);
  assert.equal(c.net.furnaceRefreshKey, key);
  assert.equal(c.commands().filter((command) => command.type === "openFurnace").length, 0);
  c.answer(pending, loaded(), 2, 2);
  const refresh = c.commands().at(-1);
  assert.equal(refresh.type, "openFurnace");
  assert.equal(c.net.furnaceRefreshKey, null);
  const current = loaded(21, 7);
  current.slots[2] = { id: 110, n: 1 };
  c.answer(refresh, current, 4, 3);
  assert.deepEqual(c.game.adventure.data.furnaces[key], restoreFurnace(current));
  assert.equal(c.net.furnaceRevisions.get(key), 4);
  assert.deepEqual(c.pauses, ["furnace"]);
});

test("A destroyed furnace at the entity cap preserves overflow through save and later draining", () => {
  const s = setup();
  for (let i = 0; i < 300; i++) s.room.drop("overworld", 8, 1, [i, 52, 20]);
  s.room.furnaces[s.key] = loaded();
  s.room.furnaces[s.key].slots[2] = { id: 110, n: 4 };
  s.room.ensure("overworld", 30, 30).set(30, 51, 29, 0);
  assert.equal(s.room.drops.length, 300);
  assert.deepEqual(totals(s.room.pendingDrops), { 21: 8, 109: 1, 110: 4 });
  const saved = JSON.parse(JSON.stringify(s.room.save()));
  const restored = new Room(
    () => {},
    () => 100000,
  );
  restored.restore(saved);
  assert.deepEqual(totals(restored.pendingDrops), { 21: 8, 109: 1, 110: 4 });
  const collected = restored.drops.splice(0, 3);
  restored.drainPendingDrops();
  assert.equal(restored.drops.length, 300);
  assert.equal(restored.pendingDrops.length, 0);
  assert.deepEqual(totals([...restored.drops, ...collected]), { 8: 300, 21: 8, 109: 1, 110: 4 });
});

test("Pending drop groups are bounded and retain every item across dimensions and distant areas", () => {
  const room = new Room(() => {});
  for (let i = 0; i < 300; i++) room.drop("overworld", 8, 1, [i, 52, 20]);
  for (let i = 0; i < 2000; i++) room.drop("overworld", 21, 2, [i * 20, 52, 20]);
  // A previously unseen type at the cap compacts existing duplicate groups first.
  room.drop("nether", 109, 5, [0, 52, 20]);
  room.drop("end", 110, 7, [0, 52, 20]);
  assert(room.pendingDrops.length <= 512);
  assert.deepEqual(totals(room.pendingDrops), { 21: 4000, 109: 5, 110: 7 });
  assert.equal(room.pendingDrops.find((d) => d.id === 109)?.dimension, "nether");
  const restored = new Room(() => {});
  restored.restore(JSON.parse(JSON.stringify(room.save())));
  assert.deepEqual(totals(restored.pendingDrops), totals(room.pendingDrops));
  assert(restored.pendingDrops.length <= 512);
});
