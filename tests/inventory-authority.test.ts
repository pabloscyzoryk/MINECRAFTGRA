import test from "node:test";
import assert from "node:assert/strict";
import { Room } from "../server/room";
import { InventoryPack } from "../lib/inventory";
function setup() {
  const messages: any[] = [];
  const room = new Room((_id, m) => messages.push(m));
  room.join("a", "Alicja", undefined);
  return { room, p: room.players.get("a")!, messages };
}
test("A profile cannot inject items or equip an unowned weapon", () => {
  const { room, p } = setup();
  const pack = new InventoryPack();
  pack.slots[0] = { id: 108, n: 1 };
  room.profile("a", { inventory: { 108: 1 }, pack: pack.snapshot() });
  assert.deepEqual(p.profile.inventory, {});
  room.input("a", { p: p.p, dimension: "overworld", held: 108 });
  assert.equal(p.held, 0);
});
test("Server crafting consumes ingredients and preserves result cursor", () => {
  const { room, p, messages } = setup();
  p.profile.inventory = { 5: 2 };
  const pack = new InventoryPack();
  pack.grid[0] = { id: 5, n: 2 };
  room.profile("a", { inventory: { 5: 2 }, pack: pack.snapshot() });
  room.command("a", { type: "craft", req: "craft1" });
  const result = messages.at(-1);
  assert(result.ok);
  assert.deepEqual(result.pack.cursor, { id: 8, n: 4 });
  assert.equal((p.profile.inventory as any)[5], 1);
  assert.equal((p.profile.inventory as any)[8], 4);
  room.command("a", { type: "craft", req: "craft1" });
  assert.equal((p.profile.inventory as any)[8], 4);
});
test("Chest swapping conserves both stacks and survives reconnect", () => {
  const { room, p, messages } = setup();
  p.p = [30, 50, 30];
  const world = room.ensure("overworld", 30, 30);
  world.set(30, 51, 29, 61);
  p.profile.inventory = { 8: 20 };
  const pack = new InventoryPack();
  pack.cursor = { id: 8, n: 20 };
  room.profile("a", { pack: pack.snapshot() });
  room.command("a", {
    type: "chestClick",
    req: "put",
    x: 30,
    y: 51,
    z: 29,
    index: 22,
    cursor: { id: 8, n: 20 },
  });
  assert.equal((p.profile.inventory as any)[8] ?? 0, 0);
  assert.equal(room.slots["overworld:30,51,29"][22]!.n, 20);
  room.command("a", {
    type: "chestClick",
    req: "take",
    x: 30,
    y: 51,
    z: 29,
    index: 22,
    right: true,
    cursor: null,
  });
  assert.deepEqual(messages.at(-1).pack.cursor, { id: 8, n: 10 });
  const saved = room.save();
  const restored = new Room(() => {});
  restored.restore(saved);
  assert.equal((restored.players.get("a")!.profile.inventory as any)[8], 10);
  assert.equal(restored.slots["overworld:30,51,29"][22]!.n, 10);
});
test("Rejected placement cannot create a block without owning its item", () => {
  const { room, p, messages } = setup();
  p.p = [30, 50, 30];
  const w = room.ensure("overworld", 30, 30);
  w.set(30, 50, 28, 3);
  p.held = 8;
  room.command("a", { type: "use", req: "fake", x: 30, y: 50, z: 28, place: [30, 51, 28] });
  assert.equal(messages.at(-1).ok, false);
  assert.equal(w.get(30, 51, 28), 0);
});
