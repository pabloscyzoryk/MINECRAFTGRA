import test from "node:test";
import assert from "node:assert/strict";
import { Room } from "../server/room";
import { weapon, miningDuration } from "../lib/combat";
import { blankChest, clickStack, chestCounts } from "../lib/chest-slots";
import { validNick, validVoice, validToken } from "../lib/net-protocol";
import { InventoryPack } from "../lib/inventory";
function fixture() {
  let now = 100000;
  const messages: { id: string; data: any }[] = [];
  const r = new Room(
    (id, data) => messages.push({ id, data }),
    () => now,
  );
  r.join("a", "Alicja", undefined);
  r.join("b", "Bartek", undefined);
  const a = r.players.get("a")!,
    b = r.players.get("b")!;
  const advance = (n = 1000) => {
    now += n;
  };
  const command = (id: string, c: any) => {
    r.command(id, { req: "r" + messages.length, ...c });
    return messages.at(-1)?.data;
  };
  return { r, a, b, messages, advance, command };
}
test("New online characters have empty inventories and unique names", () => {
  const { r, a, messages } = fixture();
  assert.deepEqual(a.profile.inventory ?? {}, {});
  assert.equal(a.profile.difficulty, "normal");
  assert.equal(a.profile.food, 20);
  const pack = new InventoryPack();
  pack.restore((a.profile.pack ?? {}) as any);
  assert(pack.slots.every((s) => s === null));
  assert(pack.grid.every((s) => s === null));
  assert.equal(pack.cursor, null);
  r.join("c", "Alicja", undefined);
  assert.equal(messages.at(-1)?.data.fatal, true);
  assert(!r.players.has("c"));
});
test("Two players share an edit; a block can only be mined once", () => {
  const { r, a, b, command, advance } = fixture();
  const w = r.ensure("overworld", 30, 30);
  a.p = [30, 50, 30];
  b.p = [31, 50, 30];
  w.set(30, 51, 29, 5);
  advance();
  const first = command("a", { type: "mine", x: 30, y: 51, z: 29, expected: 5 });
  assert.equal(first.ok, true);
  const second = command("b", { type: "mine", x: 30, y: 51, z: 29, expected: 5 });
  assert.equal(second.ok, false);
  assert.equal(w.get(30, 51, 29), 0);
});
test("Repeated command identifiers do not duplicate an award", () => {
  const { r, a, messages } = fixture();
  a.p = [30, 50, 30];
  const w = r.ensure("overworld", 30, 30);
  w.set(30, 51, 29, 5);
  const c = { type: "mine", req: "same", x: 30, y: 51, z: 29, expected: 5 };
  r.command("a", c);
  const first = messages.at(-1)?.data;
  r.command("a", c);
  assert.deepEqual(messages.at(-1)?.data, first);
  assert.equal(a.responses.same, first);
});
test("Chest has 27 stable slots, arbitrary placement and right click splitting", () => {
  const { r, a, command, advance } = fixture();
  a.p = [30, 50, 30];
  const w = r.ensure("overworld", 30, 30);
  w.set(30, 51, 29, 61);
  a.profile.inventory = { 8: 20 };
  const open = command("a", { type: "chest", x: 30, y: 51, z: 29 });
  assert.equal(open.chest.slots.length, 27);
  assert(open.chest.slots.every((s: any) => s === null));
  const put = command("a", {
    type: "chestClick",
    x: 30,
    y: 51,
    z: 29,
    index: 22,
    cursor: { id: 8, n: 20 },
  });
  assert.deepEqual(put.chest.slots[22], { id: 8, n: 20 });
  advance();
  const half = command("a", {
    type: "chestClick",
    x: 30,
    y: 51,
    z: 29,
    index: 22,
    right: true,
    cursor: null,
  });
  assert.deepEqual(half.cursor, { id: 8, n: 10 });
  assert.deepEqual(half.chest.slots[22], { id: 8, n: 10 });
});
test("Simultaneous chest pickups cannot duplicate the same stack", () => {
  const { r, a, b, command } = fixture();
  a.p = b.p = [30, 50, 30];
  a.profile.inventory = { 8: 20 };
  const w = r.ensure("overworld", 30, 30);
  w.set(30, 51, 29, 61);
  command("a", { type: "chestClick", x: 30, y: 51, z: 29, index: 3, cursor: { id: 8, n: 20 } });
  const first = command("a", { type: "chestClick", x: 30, y: 51, z: 29, index: 3, cursor: null });
  const second = command("b", { type: "chestClick", x: 30, y: 51, z: 29, index: 3, cursor: null });
  assert.equal(first.cursor.n, 20);
  assert.equal(second.cursor, null);
});
test("Snapshot restores edits in all dimensions without stale cross-dimension overwrite", () => {
  const { r } = fixture();
  r.region("overworld").world.set(70, 40, 70, 8);
  r.region("nether").world.set(70, 40, 70, 12);
  r.region("end").world.set(70, 40, 70, 16);
  const copy = new Room(() => {});
  copy.restore(r.save());
  copy.region("overworld").world.set(70, 40, 70, 9);
  const save = copy.save();
  assert.equal(save.edits["overworld:70,40,70"], 9);
  assert.equal(save.edits["nether:70,40,70"], 12);
  assert.equal(save.edits["end:70,40,70"], 16);
});
test("PvP applies cooldown, stamina and directional shield blocking", () => {
  const { r, a, b, command, advance } = fixture();
  a.p = [40, 50, 40];
  b.p = [40, 50, 37];
  a.yaw = 0;
  b.yaw = Math.PI;
  a.held = 104;
  b.held = 126;
  b.blocking = true;
  r.ensure("overworld", 40, 40);
  advance(9000);
  const hit = command("a", { type: "pvp", target: "b" });
  assert.equal(hit.ok, true);
  assert(b.health > 14 && b.health < 20);
  assert(a.stamina < 100);
  const hp = b.health;
  const spam = command("a", { type: "pvp", target: "b" });
  assert.equal(spam.ok, false);
  assert.equal(b.health, hp);
  advance(1500);
  a.held = 127;
  command("a", { type: "pvp", target: "b" });
  assert(b.blockUntil > 0);
});
test("Safe spawn, spawn protection and walls stop PvP damage", () => {
  const { r, a, b, command, advance } = fixture();
  a.p = [8, 50, 22];
  b.p = [8, 50, 19];
  assert.equal(command("a", { type: "pvp", target: "b" }).ok, false);
  a.p = [40, 50, 40];
  b.p = [40, 50, 37];
  assert.equal(command("a", { type: "pvp", target: "b" }).ok, false);
  advance(9000);
  const w = r.ensure("overworld", 40, 40);
  w.set(40, 51, 38, 3);
  a.held = 104;
  assert.equal(command("a", { type: "pvp", target: "b" }).ok, false);
  assert.equal(b.health, 20);
});
test("Death drops possessions and respawn is empty with renewed protection", () => {
  const { r, a, command, advance } = fixture();
  a.profile = { inventory: { 8: 12, 104: 1 }, food: 20 };
  advance(9000);
  r.damage(a, 25);
  assert.equal(a.health, 0);
  assert.equal(
    r.drops.reduce((sum, d) => sum + d.n, 0),
    13,
  );
  command("a", { type: "respawn" });
  assert.equal(a.health, 20);
  assert.deepEqual(a.profile.inventory, {});
  assert(a.spawnUntil > 0);
});
test("Server-authoritative water is present in synchronized changes", () => {
  const { r, a } = fixture();
  a.p = [40, 50, 40];
  a.seen = 100000;
  const w = r.ensure("overworld", 40, 40);
  for (let x = 35; x < 47; x++) for (let z = 35; z < 47; z++) w.set(x, 49, z, 3);
  w.set(40, 52, 40, 7);
  for (let i = 0; i < 25; i++) r.tick(0.05);
  const frame = r.frame();
  assert(frame.changes.some((c) => c[4] === 7 && c[2] < 52));
});
test("Mobs and dragon use a single shared simulation", () => {
  const { r, a, b } = fixture();
  r.tick(0.05);
  const first = r.frame();
  assert((first.mobs.overworld?.length ?? 0) > 0);
  const ids = first.mobs.overworld!.map((m) => m.id);
  r.tick(0.05);
  assert.deepEqual(
    r.frame().mobs.overworld!.map((m) => m.id),
    ids,
  );
  a.dimension = b.dimension = "end";
  a.p = [0, 20, 39];
  b.p = [5, 20, 39];
  r.tick(0.05);
  assert(r.dragon.time > 0);
  r.hitDragon(r.dragon.hp);
  assert(r.won);
  assert.equal(r.dragon.hp, 0);
});
test("Tool material and block type change mining speed; weapons have distinct roles", () => {
  assert(miningDuration(3, 103) < miningDuration(3, 101));
  assert(miningDuration(5, 127) < miningDuration(5, 103));
  assert(miningDuration(2, 130) < miningDuration(2, 104));
  assert(weapon(127).damage > weapon(104).damage);
  assert(weapon(127).cooldown > weapon(104).cooldown);
  assert(weapon(129).reach > weapon(104).reach);
});
test("Nickname, anonymous credentials and voice frame validation reject malformed input", () => {
  assert(validNick("Paweł_42"));
  assert(!validNick("<script>"));
  assert(!validNick("a"));
  assert(validToken("a".repeat(64)));
  assert(!validToken("a".repeat(24)));
  assert(validVoice(Buffer.alloc(3200).toString("base64")));
  assert(!validVoice("javascript:alert(1)"));
  assert(!validVoice("A".repeat(20000)));
});
test("Chat treats markup as text and limits message length", () => {
  const { r, messages } = fixture();
  r.chatMessage("a", "<script>hello</script>" + ".".repeat(500));
  const m = messages.at(-1)!.data;
  assert.equal(m.type, "chat");
  assert.equal(m.text.length, 240);
  assert(m.text.startsWith("<script>"));
});
test("Slot operations preserve every item and reveal remaining capacity", () => {
  const slots = blankChest();
  let result = clickStack(slots[26], { id: 8, n: 64 });
  slots[26] = result.slot;
  result = clickStack(slots[26], null, true);
  slots[26] = result.slot;
  assert.equal(chestCounts(slots)[8] + result.cursor!.n, 64);
  assert.equal(slots.filter((s) => !s).length, 26);
});
