import test from "node:test";
import assert from "node:assert/strict";
import { Room } from "../server/room";
import { createFurnace } from "../lib/furnace";

function setup() {
  let now = 1000000;
  const messages: any[] = [],
    room = new Room(
      (_id, data) => messages.push(data),
      () => now,
    );
  room.join("a", "Alicja", undefined);
  const player = room.players.get("a")!;
  player.p = [30, 50, 30];
  const world = room.ensure("overworld", 30, 30),
    key = "overworld:30,51,29";
  return {
    room,
    player,
    world,
    key,
    messages,
    mine(block: number, held: number, elapsed = 1000000) {
      player.held = held;
      player.lastAction = 0;
      player.profile.lastMine = now - elapsed;
      world.set(30, 51, 29, block);
      room.command("a", {
        type: "mine",
        req: "mine-" + messages.length,
        x: 30,
        y: 51,
        z: 29,
        expected: block,
      });
      return messages.at(-1);
    },
    advance(dt: number) {
      now += dt;
    },
  };
}

test("Wrong-tier mining removes ore after work but grants neither the ore nor XP", () => {
  for (const [block, held] of [
    [3, 0],
    [21, 101],
    [22, 102],
    [12, 131],
  ]) {
    const s = setup(),
      result = s.mine(block, held);
    assert.equal(result.ok, true);
    assert.equal(s.world.get(30, 51, 29), 0);
    assert.deepEqual(result.grant, []);
    assert.equal(result.xp, 0);
  }
});

test("Correct wood, stone, new iron and diamond tiers harvest their proper resources", () => {
  for (const [block, held, drop] of [
    [20, 101, 109],
    [21, 102, 21],
    [22, 131, 111],
    [12, 103, 12],
  ]) {
    const s = setup(),
      result = s.mine(block, held);
    assert.equal(result.ok, true);
    assert.deepEqual(result.grant, [[drop, 1]]);
    assert.equal(result.xp, block === 22 ? 8 : 1);
  }
});

test("New overworld and Nether minerals use shared resource drops and preserve smeltable ores", () => {
  for (const [block, drop, n] of [
    [87, 87, 1],
    [88, 134, 4],
    [89, 135, 5],
    [90, 136, 1],
    [91, 137, 1],
    [92, 92, 1],
    [93, 133, 1],
  ]) {
    assert.deepEqual(setup().mine(block, 103).grant, [[drop, n]]);
    assert.deepEqual(setup().mine(block, 0).grant, []);
  }
});

test("Server checks the shared tool speed: new iron pick completes work that stone has not", () => {
  const slow = setup(),
    fast = setup();
  assert.equal(slow.mine(22, 102, 700).ok, false);
  assert.equal(fast.mine(22, 131, 700).ok, true);
  assert.equal(slow.world.get(30, 51, 29), 22);
});

test("Instant plants need no previous-block cooldown", () => {
  const s = setup();
  for (const x of [30, 31]) {
    s.world.set(x, 51, 29, 67);
    s.room.command("a", { type: "mine", req: "flower-" + x, x, y: 51, z: 29, expected: 67 });
    assert.equal(s.messages.at(-1).ok, true);
    assert.equal(s.world.get(x, 51, 29), 0);
  }
});

test("Water, lava, portals and the bottom foundation cannot be mined; basalt above it can", () => {
  for (const block of [0, 7, 15, 13, 18]) assert.equal(setup().mine(block, 103).ok, false);
  const s = setup();
  assert.deepEqual(s.mine(35, 101).grant, [[35, 1]]);
  s.player.p = [30, 1, 30];
  s.world.set(30, 0, 29, 35);
  s.room.command("a", { type: "mine", req: "foundation", x: 30, y: 0, z: 29, expected: 35 });
  assert.equal(s.messages.at(-1).ok, false);
  assert.equal(s.world.get(30, 0, 29), 35);
});

test("Leaves require new shears for their block drop and glass always breaks without an item", () => {
  assert.deepEqual(setup().mine(6, 118).grant, []);
  assert.deepEqual(setup().mine(6, 132).grant, [[6, 1]]);
  assert.deepEqual(setup().mine(10, 103).grant, []);
});

test("Breaking a furnace with the wrong tool preserves every stored item, even without a furnace drop", () => {
  const s = setup();
  s.room.furnaces[s.key] = createFurnace();
  s.room.furnaces[s.key].slots = [
    { id: 21, n: 3 },
    { id: 109, n: 2 },
    { id: 110, n: 4 },
  ];
  const result = s.mine(29, 0);
  assert.equal(result.ok, true);
  assert.deepEqual(result.grant, []);
  assert.equal(s.room.furnaces[s.key], undefined);
  assert.equal(
    s.room.drops.reduce((n, d) => n + d.n, 0),
    9,
  );
  assert.equal(
    s.room.drops.some((d) => d.id === 29),
    false,
  );
});

test("Mining a chest preserves arbitrary stored stacks and a duplicate command cannot duplicate loot", () => {
  const s = setup();
  s.room.storage[s.key] = { 110: 64, 111: 2 };
  const result = s.mine(61, 0);
  assert.deepEqual(result.grant, [
    [61, 1],
    [110, 64],
    [111, 2],
  ]);
  const count = structuredClone(s.player.profile.inventory);
  s.room.command("a", { type: "mine", req: result.req, x: 30, y: 51, z: 29, expected: 61 });
  assert.deepEqual(s.player.profile.inventory, count);
  assert.equal(s.room.storage[s.key], undefined);
});
