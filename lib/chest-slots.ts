import { maxStack, type Stack } from "./inventory";
export type ChestSlots = (Stack | null)[];
export const blankChest = (): ChestSlots => Array.from({ length: 27 }, () => null);
export function fromCounts(counts: Record<number, number>): ChestSlots {
  const slots = blankChest();
  let i = 0;
  for (const [key, n] of Object.entries(counts)) {
    const id = Number(key);
    let left = n;
    while (left > 0 && i < 27) {
      const amount = Math.min(maxStack(id), left);
      slots[i++] = { id, n: amount };
      left -= amount;
    }
  }
  return slots;
}
export function chestCounts(slots: ChestSlots) {
  const counts: Record<number, number> = {};
  for (const s of slots) if (s) counts[s.id] = (counts[s.id] ?? 0) + s.n;
  return counts;
}
export function clickStack(
  slot: Stack | null,
  cursor: Stack | null,
  right = false,
): { slot: Stack | null; cursor: Stack | null } {
  let a = slot ? { ...slot } : null,
    b = cursor ? { ...cursor } : null;
  if (!b && a) {
    const take = right ? Math.ceil(a.n / 2) : a.n;
    b = { id: a.id, n: take };
    a.n -= take;
    if (!a.n) a = null;
  } else if (b && !a) {
    const take = right ? 1 : b.n;
    a = { id: b.id, n: take };
    b.n -= take;
    if (!b.n) b = null;
  } else if (a && b && a.id === b.id) {
    const take = Math.min(maxStack(a.id) - a.n, right ? 1 : b.n);
    a.n += take;
    b.n -= take;
    if (!b.n) b = null;
  } else if (a && b && !right) [a, b] = [b, a];
  return { slot: a, cursor: b };
}
