import test from "node:test";
import assert from "node:assert/strict";
import { Room } from "../server/room";
import { InventoryPack } from "../lib/inventory";
import { emptyEquipment } from "../lib/armor";
import { Mob } from "../lib/entities";

function setup() {
  let now = 100000;
  const messages: any[] = [],
    room = new Room(
      (_id, data) => messages.push(data),
      () => now,
    );
  room.join("a", "Alicja", undefined);
  const player = room.players.get("a")!;
  return {
    room,
    player,
    messages,
    install(pack: InventoryPack) {
      player.profile.pack = pack.snapshot();
      player.profile.inventory = pack.counts();
    },
    command(command: Record<string, unknown>) {
      room.command("a", {
        req: "cmd-" + messages.length,
        baseRevision: Number(player.profile.inventoryRevision) || 0,
        ...command,
      } as any);
      return messages.at(-1);
    },
    time() {
      now += 1000;
    },
  };
}

test("Four armor pieces are real items moved out of the pack and synchronized in results and public players", () => {
  const s = setup(),
    pack = new InventoryPack(),
    ids = [149, 121, 150, 151];
  ids.forEach((id, index) => {
    pack.slots[index] = { id, n: 1 };
  });
  s.install(pack);
  for (const id of ids) {
    const result = s.command({ type: "equipArmor", id });
    assert.equal(result.ok, true);
    assert.deepEqual(result.equipment, s.player.equipment);
  }
  assert.deepEqual(s.player.equipment, { head: 149, chest: 121, legs: 150, feet: 151 });
  assert.deepEqual(s.player.profile.inventory, {});
  assert.deepEqual(s.room.publicPlayer(s.player).equipment, s.player.equipment);
});

test("Equipment commands reject invented items, wrong slots, stale cursor and stale revision without mutation", () => {
  const s = setup(),
    pack = new InventoryPack();
  pack.cursor = { id: 149, n: 1 };
  s.install(pack);
  for (const command of [
    { type: "equipArmor", id: 122 },
    { type: "armor", slot: "feet", expectedCursor: { id: 149, n: 1 } },
    { type: "armor", slot: "head", expectedCursor: null },
    { type: "armor", slot: "head", baseRevision: 99 },
    { type: "armor", slot: "head", expectedEquipped: 152 },
  ]) {
    assert.equal(s.command(command).ok, false);
    assert.deepEqual(s.player.equipment, emptyEquipment());
    assert.deepEqual(s.player.profile.inventory, { 149: 1 });
  }
  assert.equal(
    s.command({
      type: "armor",
      slot: "head",
      expectedCursor: { id: 149, n: 1 },
      expectedEquipped: 0,
    }).ok,
    true,
  );
  assert.equal(s.player.equipment.head, 149);
});

test("Unequipping into the cursor works with a completely full pack and duplicate ACKs stay immutable", () => {
  const s = setup(),
    pack = new InventoryPack();
  pack.slots[0] = { id: 149, n: 1 };
  s.install(pack);
  s.command({ type: "equipArmor", id: 149 });
  const full = new InventoryPack();
  full.slots.fill(null);
  for (let i = 0; i < 36; i++) full.slots[i] = { id: 3, n: 64 };
  s.install(full);
  const revision = Number(s.player.profile.inventoryRevision),
    result = s.command({ type: "armor", slot: "head", expectedCursor: null, req: "remove" }),
    snapshot = structuredClone(result);
  assert.equal(result.ok, true);
  assert.deepEqual(result.pack.cursor, { id: 149, n: 1 });
  assert.equal(s.player.equipment.head, 0);
  s.command({ type: "armor", slot: "head", expectedCursor: { id: 149, n: 1 } });
  assert.equal(s.player.equipment.head, 149);
  s.command({ type: "armor", slot: "head", req: "remove", baseRevision: revision });
  assert.deepEqual(s.messages.at(-1), snapshot);
  assert.equal(s.player.equipment.head, 149);
  assert.deepEqual(result, snapshot);
});

test("Input and profile metadata cannot equip free armor or overwrite actual worn pieces", () => {
  const s = setup();
  const equipment = { head: 152, chest: 122, legs: 153, feet: 154 };
  s.room.input("a", { p: s.player.p, dimension: "overworld", active: true, equipment, armor: 122 });
  s.room.profile("a", { equipment, adventure: { equipment, armor: 122 } });
  assert.deepEqual(s.player.equipment, emptyEquipment());
  assert.deepEqual(s.player.profile.equipment, emptyEquipment());
  s.room.damage(s.player, 5, [0, 0, 0], "pvp");
  assert.equal(s.player.health, 15);
});

test("All four armor pieces reduce actual combat damage and hazard exceptions bypass armor", () => {
  const s = setup(),
    pack = new InventoryPack();
  [152, 122, 153, 154].forEach((id, i) => {
    pack.slots[i] = { id, n: 1 };
  });
  s.install(pack);
  for (const id of [152, 122, 153, 154]) s.command({ type: "equipArmor", id });
  s.room.damage(s.player, 10, [0, 0, 0], "pvp", "pvp");
  assert(Math.abs(s.player.health - 18) < 0.0001);
  for (const reason of ["fall", "drowning", "hunger", "void"]) {
    s.time();
    s.player.health = 20;
    s.room.damage(s.player, 5, [0, 0, 0], "environment", reason);
    assert.equal(s.player.health, 15, reason);
  }
});

test("Death drops every worn item once and respawn has empty armor slots", () => {
  const s = setup(),
    pack = new InventoryPack();
  [141, 142, 143, 144].forEach((id, i) => {
    pack.slots[i] = { id, n: 1 };
  });
  s.install(pack);
  for (const id of [141, 142, 143, 144]) s.command({ type: "equipArmor", id });
  s.room.damage(s.player, 1000, [0, 0, 0], "environment", "void");
  assert.deepEqual(s.room.drops.map((drop) => drop.id).sort(), [141, 142, 143, 144]);
  assert.deepEqual(s.player.equipment, emptyEquipment());
  s.time();
  s.room.damage(s.player, 1000);
  assert.equal(s.room.drops.length, 4);
  s.command({ type: "respawn" });
  assert.equal(s.player.health, 20);
  assert.deepEqual(s.player.equipment, emptyEquipment());
  assert.deepEqual(s.player.profile.inventory, {});
});

test("Persistence preserves separate equipment; migration consumes one owned legacy chestplate exactly once", () => {
  const s = setup(),
    pack = new InventoryPack();
  pack.slots[5] = { id: 121, n: 1 };
  s.install(pack);
  const legacy: any = s.room.save();
  delete legacy.players[0].equipment;
  legacy.players[0].profile.adventure = { armor: 121 };
  const room = new Room(() => {});
  room.restore(legacy);
  const restored = room.players.get("a")!;
  assert.equal(restored.equipment.chest, 121);
  assert.deepEqual(restored.profile.inventory, {});
  const again = new Room(() => {});
  again.restore(room.save());
  assert.equal(again.players.get("a")!.equipment.chest, 121);
  assert.deepEqual(again.players.get("a")!.profile.inventory, {});
  legacy.players[0].profile.inventory = {};
  legacy.players[0].profile.pack = undefined;
  const missing = new Room(() => {});
  missing.restore(legacy);
  assert.deepEqual(missing.players.get("a")!.equipment, emptyEquipment());
});

test("Server cow drops leather once for armor crafting", () => {
  const s = setup(),
    world = s.room.region("overworld").world,
    cow = new Mob("cow", 10, 20, world);
  s.room.hitMob(s.player, cow, 100);
  s.room.hitMob(s.player, cow, 100);
  assert.equal(
    s.room.drops.filter((drop) => drop.id === 140).reduce((n, drop) => n + drop.n, 0),
    1,
  );
  assert(s.room.drops.some((drop) => drop.id === 107));
  cow.dispose();
});
