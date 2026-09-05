import test from "node:test";
import assert from "node:assert/strict";
import { InventoryPack } from "../lib/inventory";
import {
  ARMOR_SLOTS,
  armorSlot,
  armorPoints,
  armorMultiplier,
  emptyEquipment,
  normalizeEquipment,
  migrateEquipment,
  clickArmorSlot,
  equipArmorItem,
  type Equipment,
} from "../lib/armor";

const counts = (pack: InventoryPack, equipment: Equipment) => {
  const result = pack.counts();
  for (const id of Object.values(equipment)) if (id) result[id] = (result[id] ?? 0) + 1;
  return result;
};

test("Four material sets contribute their actual armor points and invalid slots never grant protection", () => {
  for (const [ids, points] of [
    [[141, 142, 143, 144], 7],
    [[145, 146, 147, 148], 11],
    [[149, 121, 150, 151], 15],
    [[152, 122, 153, 154], 20],
  ] as const) {
    const equipment = Object.fromEntries(ARMOR_SLOTS.map((slot, i) => [slot, ids[i]]));
    assert.equal(armorPoints(equipment), points);
    assert(Math.abs(armorMultiplier(equipment) - (1 - points * 0.04)) < 1e-10);
    for (let i = 0; i < 4; i++) assert.equal(armorSlot(ids[i]), ARMOR_SLOTS[i]);
  }
  assert.deepEqual(
    normalizeEquipment({ head: 122, chest: 152, legs: -1, feet: "154" }),
    emptyEquipment(),
  );
  assert.equal(armorPoints(null), 0);
  assert.equal(
    armorMultiplier({ head: 152, chest: 122, legs: 153, feet: 154, bogus: 999 }),
    0.19999999999999996,
  );
});

test("Wearing, swapping and removing physical armor conserves each item even with a completely full pack", () => {
  const pack = new InventoryPack(),
    equipment = emptyEquipment();
  pack.slots.fill(null);
  for (let i = 0; i < 36; i++) pack.slots[i] = { id: 1, n: 64 };
  pack.slots[8] = { id: 121, n: 1 };
  pack.cursor = { id: 122, n: 1 };
  const before = counts(pack, equipment);
  assert(equipArmorItem(pack, equipment, 121));
  assert.equal(pack.slots[8], null);
  pack.slots[8] = { id: 1, n: 64 };
  const full = counts(pack, equipment);
  assert(clickArmorSlot(pack, equipment, "chest"));
  assert.equal(equipment.chest, 122);
  assert.deepEqual(pack.cursor, { id: 121, n: 1 });
  assert.deepEqual(counts(pack, equipment), full);
  assert(clickArmorSlot(pack, equipment, "chest"));
  pack.cursor = null;
  assert(clickArmorSlot(pack, equipment, "chest"));
  assert.equal(equipment.chest, 0);
  assert.deepEqual(pack.cursor, { id: 121, n: 1 });
  assert.equal(before[121], 1);
});

test("Direct item equip swaps into the exact source slot and rejects wrong items without any mutation", () => {
  const pack = new InventoryPack(),
    equipment = normalizeEquipment({ head: 141, chest: 121 });
  pack.slots[19] = { id: 152, n: 1 };
  pack.cursor = { id: 1, n: 64 };
  const before = counts(pack, equipment);
  assert(equipArmorItem(pack, equipment, 152));
  assert.equal(equipment.head, 152);
  assert.deepEqual(pack.slots[19], { id: 141, n: 1 });
  assert.deepEqual(counts(pack, equipment), before);
  const snapshot = pack.snapshot(),
    copy = { ...equipment };
  assert.equal(clickArmorSlot(pack, equipment, "head"), false);
  assert.equal(equipArmorItem(pack, equipment, 153), false);
  assert.equal(equipArmorItem(pack, equipment, 1), false);
  assert.deepEqual(pack.snapshot(), snapshot);
  assert.deepEqual(equipment, copy);
});

test("Legacy selected chestplate migrates once from an owned item; forged or missing copies grant nothing", () => {
  for (const area of ["slots", "grid", "cursor"] as const) {
    const pack = new InventoryPack();
    if (area === "cursor") pack.cursor = { id: 121, n: 1 };
    else pack[area][0] = { id: 121, n: 1 };
    const equipment = migrateEquipment(undefined, 121, pack);
    assert.deepEqual(equipment, { head: 0, chest: 121, legs: 0, feet: 0 });
    assert.deepEqual(pack.counts(), {});
    const restored = migrateEquipment(equipment, 121, pack);
    assert.deepEqual(restored, equipment);
    assert.equal(counts(pack, equipment)[121], 1);
  }
  const pack = new InventoryPack();
  assert.deepEqual(migrateEquipment(undefined, 122, pack), emptyEquipment());
  pack.slots[0] = { id: 149, n: 1 };
  assert.deepEqual(migrateEquipment(undefined, 149, pack), emptyEquipment());
  assert.deepEqual(pack.slots[0], { id: 149, n: 1 });
});

test("Repeated armor transfers never duplicate or lose equipment across arbitrary slot choices", () => {
  const pack = new InventoryPack(),
    equipment = emptyEquipment();
  const ids = [141, 142, 143, 144, 145, 146, 147, 148, 149, 121, 150, 151, 152, 122, 153, 154];
  ids.forEach((id, i) => {
    pack.slots[i] = { id, n: 1 };
  });
  const before = counts(pack, equipment);
  for (let step = 0; step < 500; step++) {
    if (step % 3) equipArmorItem(pack, equipment, ids[(step * 7) % ids.length]);
    else clickArmorSlot(pack, equipment, ARMOR_SLOTS[(step * 11) % 4]);
    assert.deepEqual(counts(pack, equipment), before);
    for (const slot of ARMOR_SLOTS) assert(!equipment[slot] || armorSlot(equipment[slot]) === slot);
  }
});

test("Dragging armor uses the precise source slot and rejects changed snapshots without fallback", () => {
  const pack = new InventoryPack(),
    equipment = normalizeEquipment({ head: 141 });
  pack.slots[3] = { id: 152, n: 1 };
  pack.slots[18] = { id: 152, n: 1 };
  pack.cursor = { id: 152, n: 1 };
  const before = counts(pack, equipment);
  assert(equipArmorItem(pack, equipment, 152, { area: "slots", index: 18 }, { id: 152, n: 1 }));
  assert.deepEqual(pack.slots[18], { id: 141, n: 1 });
  assert.deepEqual(pack.slots[3], { id: 152, n: 1 });
  assert.deepEqual(pack.cursor, { id: 152, n: 1 });
  const snapshot = pack.snapshot(),
    worn = { ...equipment };
  assert.equal(
    equipArmorItem(pack, equipment, 152, { area: "slots", index: 18 }, { id: 152, n: 1 }),
    false,
  );
  assert.equal(equipArmorItem(pack, equipment, 152, { area: "slots", index: -1 }), false);
  assert.equal(equipArmorItem(pack, equipment, 152, { area: "slots", index: 3 }, null), false);
  assert.deepEqual(pack.snapshot(), snapshot);
  assert.deepEqual(equipment, worn);
  assert.deepEqual(counts(pack, equipment), before);
});
