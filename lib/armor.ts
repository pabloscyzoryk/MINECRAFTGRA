import type { InventoryPack, Stack } from "./inventory";

export const ARMOR_SLOTS = ["head", "chest", "legs", "feet"] as const;
export type ArmorSlot = (typeof ARMOR_SLOTS)[number];
export type Equipment = Record<ArmorSlot, number>;
export type ArmorSource = { area: "slots" | "grid"; index: number };
export type ArmorMaterial = "leather" | "gold" | "iron" | "diamond";
export const ARMOR_LABELS: Record<ArmorSlot, string> = {
  head: "Hełm",
  chest: "Napierśnik",
  legs: "Nogawice",
  feet: "Buty",
};
export const ARMOR_COLORS: Record<ArmorMaterial, string> = {
  leather: "#9c6946",
  gold: "#e5c45d",
  iron: "#bdcdd0",
  diamond: "#59dace",
};
const sets: [ArmorMaterial, number[], number[]][] = [
  ["leather", [141, 142, 143, 144], [1, 3, 2, 1]],
  ["gold", [145, 146, 147, 148], [2, 5, 3, 1]],
  ["iron", [149, 121, 150, 151], [2, 6, 5, 2]],
  ["diamond", [152, 122, 153, 154], [3, 8, 6, 3]],
];
const definitions = new Map(
  sets.flatMap(([material, ids, points]) =>
    ids.map(
      (id, index) => [id, { material, slot: ARMOR_SLOTS[index], points: points[index] }] as const,
    ),
  ),
);
export const emptyEquipment = (): Equipment => ({ head: 0, chest: 0, legs: 0, feet: 0 });
export const armorInfo = (id: number) => definitions.get(id) ?? null;
export const armorSlot = (id: number): ArmorSlot | null => armorInfo(id)?.slot ?? null;
export function normalizeEquipment(value: unknown, legacyArmor = 0): Equipment {
  const result = emptyEquipment();
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const slot of ARMOR_SLOTS) {
      const id = (value as Record<string, unknown>)[slot];
      if (typeof id === "number" && armorSlot(id) === slot) result[slot] = id;
    }
  } else if (armorSlot(legacyArmor) === "chest") result.chest = legacyArmor;
  return result;
}
export function armorPoints(value: unknown) {
  const equipment = normalizeEquipment(value);
  return ARMOR_SLOTS.reduce((sum, slot) => sum + (armorInfo(equipment[slot])?.points ?? 0), 0);
}
export const armorMultiplier = (value: unknown) => 1 - Math.min(0.8, armorPoints(value) * 0.04);

/** Slot actions move a physical item: equipped parts are not also counted in the backpack. */
export function clickArmorSlot(
  pack: InventoryPack,
  equipment: Equipment,
  slot: ArmorSlot,
): boolean {
  if (!ARMOR_SLOTS.includes(slot)) return false;
  const held = pack.cursor,
    worn = equipment[slot];
  if (held && (held.n !== 1 || armorSlot(held.id) !== slot)) return false;
  if (!held && !worn) return false;
  equipment[slot] = held?.id ?? 0;
  pack.cursor = worn ? { id: worn, n: 1 } : null;
  return true;
}
export function equipArmorItem(
  pack: InventoryPack,
  equipment: Equipment,
  id: number,
  from?: ArmorSource,
  expected?: Stack | null,
): boolean {
  const slot = armorSlot(id);
  if (!slot) return false;
  if (from) {
    if ((from.area !== "slots" && from.area !== "grid") || !Number.isInteger(from.index))
      return false;
    const area = pack[from.area],
      source = area[from.index];
    if (
      !source ||
      source.id !== id ||
      source.n !== 1 ||
      (expected !== undefined &&
        (!expected || expected.id !== source.id || expected.n !== source.n))
    )
      return false;
    const old = equipment[slot];
    equipment[slot] = id;
    area[from.index] = old ? { id: old, n: 1 } : null;
    return true;
  }
  if (pack.cursor?.id === id) return clickArmorSlot(pack, equipment, slot);
  for (const area of [pack.slots, pack.grid]) {
    const index = area.findIndex((stack) => stack?.id === id && stack.n === 1);
    if (index < 0) continue;
    const old = equipment[slot];
    equipment[slot] = id;
    area[index] = old ? { id: old, n: 1 } : null;
    return true;
  }
  return false;
}
/** Old saves left the selected chestplate in the pack. Remove exactly one copy on migration. */
export function migrateEquipment(
  value: unknown,
  legacyArmor: number,
  pack: InventoryPack,
): Equipment {
  if (value && typeof value === "object" && !Array.isArray(value)) return normalizeEquipment(value);
  const result = emptyEquipment();
  if (armorSlot(legacyArmor) !== "chest") return result;
  const take = (stack: Stack | null) => {
    if (stack?.id !== legacyArmor || stack.n < 1) return false;
    stack.n--;
    result.chest = legacyArmor;
    return true;
  };
  if (take(pack.cursor)) {
    if (!pack.cursor!.n) pack.cursor = null;
    return result;
  }
  for (const area of [pack.slots, pack.grid])
    for (let i = 0; i < area.length; i++) {
      if (!take(area[i])) continue;
      if (!area[i]!.n) area[i] = null;
      return result;
    }
  return result;
}
