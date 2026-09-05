import { InventoryPack, maxStack, type Stack } from "./inventory";
import { clickStack, type ChestSlots } from "./chest-slots";

export type SlotRef = { area: "slots" | "grid" | "chest"; index: number };
export type InventoryGesture =
  | { type: "click"; slot: SlotRef; right?: boolean; quick?: boolean }
  | { type: "move"; from: SlotRef; to: SlotRef; expected?: Stack | null }
  | { type: "collect"; id: number };

export function validGesture(value: unknown): value is InventoryGesture {
  if (!value || typeof value !== "object") return false;
  const g = value as InventoryGesture;
  const ref = (v: SlotRef | undefined) =>
    !!v &&
    ["slots", "grid", "chest"].includes(v.area) &&
    Number.isInteger(v.index) &&
    v.index >= 0 &&
    v.index < (v.area === "slots" ? 36 : v.area === "grid" ? 9 : 27);
  if (g.type === "collect") return Number.isInteger(g.id) && g.id > 0 && g.id <= 130;
  if (g.type === "click")
    return (
      ref(g.slot) &&
      (g.right === undefined || typeof g.right === "boolean") &&
      (g.quick === undefined || typeof g.quick === "boolean")
    );
  return (
    g.type === "move" &&
    ref(g.from) &&
    ref(g.to) &&
    (g.expected == null ||
      (Number.isInteger(g.expected.id) && Number.isInteger(g.expected.n) && g.expected.n > 0))
  );
}

/** Shared by local play and the authoritative room; never trusts client item counts. */
export function applyInventoryGesture(
  pack: InventoryPack,
  gesture: InventoryGesture,
  chest?: ChestSlots,
): boolean {
  if (!validGesture(gesture)) return false;
  const cells = (ref: SlotRef): (Stack | null)[] | undefined =>
    ref.area === "chest"
      ? chest
      : ref.area === "grid" && ref.index >= pack.size * pack.size
        ? undefined
        : pack[ref.area];
  const click = (ref: SlotRef, right = false) => {
    const list = cells(ref)!;
    const result = clickStack(list[ref.index], pack.cursor, right);
    list[ref.index] = result.slot;
    pack.cursor = result.cursor;
  };
  if (gesture.type === "collect") {
    if (pack.cursor && pack.cursor.id !== gesture.id) return false;
    let amount = pack.cursor?.n ?? 0;
    const lists = [...(chest ? [chest] : []), pack.slots, pack.grid];
    // Complete partial stacks first, then take from full stacks up to one stack.
    for (const full of [false, true])
      for (const list of lists)
        for (let i = 0; i < list.length; i++) {
          if (list === pack.grid && i >= pack.size * pack.size) continue;
          const stack = list[i];
          if (!stack || stack.id !== gesture.id || (stack.n === maxStack(stack.id)) !== full)
            continue;
          const take = Math.min(stack.n, maxStack(stack.id) - amount);
          amount += take;
          stack.n -= take;
          if (!stack.n) list[i] = null;
        }
    pack.cursor = amount ? { id: gesture.id, n: amount } : null;
    return true;
  }
  if (gesture.type === "move") {
    const from = cells(gesture.from),
      to = cells(gesture.to);
    if (!from || !to) return false;
    const source = from[gesture.from.index];
    if (
      Object.hasOwn(gesture, "expected") &&
      (source?.id !== gesture.expected?.id || source?.n !== gesture.expected?.n)
    )
      return false;
    if (pack.cursor) {
      click(gesture.to);
      return true;
    }
    if (gesture.from.area === gesture.to.area && gesture.from.index === gesture.to.index)
      return true;
    if (!source) return false;
    click(gesture.from);
    click(gesture.to);
    if (pack.cursor) click(gesture.from);
    return true;
  }
  const list = cells(gesture.slot);
  if (!list) return false;
  const stack = list[gesture.slot.index];
  if (gesture.quick && stack) {
    if (chest && gesture.slot.area !== "grid") {
      if (gesture.slot.area === "chest") {
        stack.n = pack.insert(stack.id, stack.n);
      } else {
        for (const empty of [false, true])
          for (let i = 0; i < chest.length && stack.n; i++) {
            const target = chest[i];
            if (empty ? !!target : target?.id !== stack.id) continue;
            const n = Math.min(stack.n, maxStack(stack.id) - (target?.n ?? 0));
            if (n) chest[i] = { id: stack.id, n: (target?.n ?? 0) + n };
            stack.n -= n;
          }
      }
      if (!stack.n) list[gesture.slot.index] = null;
    } else
      pack.click(gesture.slot.area as "slots" | "grid", gesture.slot.index, !!gesture.right, true);
  } else click(gesture.slot, !!gesture.right);
  return true;
}
