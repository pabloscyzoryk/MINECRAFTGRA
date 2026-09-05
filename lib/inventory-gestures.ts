import { InventoryPack, maxStack, type Stack } from "./inventory";
import { BLOCKS, ITEMS } from "./blocks";
import { clickStack, type ChestSlots } from "./chest-slots";
import { canInsertFurnaceSlot, furnaceFuelSeconds, furnaceRecipe } from "./furnace";

/** result is a virtual UI source; commands route it through authorized crafting. */
export type SlotRef = { area: "slots" | "grid" | "chest" | "furnace" | "result"; index: number };
export type InventoryGesture =
  | { type: "click"; slot: SlotRef; right?: boolean; quick?: boolean }
  | { type: "move"; from: SlotRef; to: SlotRef; expected?: Stack | null }
  | { type: "collect"; id: number }
  | { type: "distribute"; slots: SlotRef[]; right?: boolean };

export function validSlotRef(value: unknown): value is SlotRef {
  if (!value || typeof value !== "object") return false;
  const v = value as SlotRef;
  return (
    ["slots", "grid", "chest", "furnace"].includes(v.area) &&
    Number.isInteger(v.index) &&
    v.index >= 0 &&
    v.index < (v.area === "slots" ? 36 : v.area === "grid" ? 9 : v.area === "furnace" ? 3 : 27)
  );
}
const knownItem = (id: number) =>
  Number.isInteger(id) && id > 0 && (!!BLOCKS[id] || ITEMS.some((item) => item.id === id));
function expectedStack(value: unknown) {
  if (value == null) return true;
  const s = value as Stack;
  return knownItem(s.id) && Number.isInteger(s.n) && s.n > 0 && s.n <= maxStack(s.id);
}
export function validGesture(value: unknown): value is InventoryGesture {
  if (!value || typeof value !== "object") return false;
  const g = value as InventoryGesture;
  if (g.type === "collect") return knownItem(g.id);
  if (g.type === "distribute")
    return (
      Array.isArray(g.slots) &&
      g.slots.length > 0 &&
      g.slots.length <= 75 &&
      g.slots.every(validSlotRef) &&
      (g.right === undefined || typeof g.right === "boolean")
    );
  if (g.type === "click")
    return (
      validSlotRef(g.slot) &&
      (g.right === undefined || typeof g.right === "boolean") &&
      (g.quick === undefined || typeof g.quick === "boolean")
    );
  return (
    g.type === "move" && validSlotRef(g.from) && validSlotRef(g.to) && expectedStack(g.expected)
  );
}

export type DistributionPlan = {
  slots: { slot: SlotRef; stack: Stack; added: number }[];
  cursor: Stack | null;
};
/** Pure preview and commit plan. A revisit never deposits twice; capped excess stays held. */
export function planDistribution(
  cursor: Stack | null,
  refs: readonly SlotRef[],
  getStack: (slot: SlotRef) => Stack | null | undefined,
  accepts: (slot: SlotRef, id: number) => boolean = () => true,
  right = false,
): DistributionPlan {
  const original = cursor ? { ...cursor } : null;
  if (!cursor || !expectedStack(cursor)) return { slots: [], cursor: original };
  const accepted: { slot: SlotRef; current: Stack | null }[] = [],
    seen = new Set<string>();
  for (const slot of refs) {
    if (!validSlotRef(slot) || accepted.length >= cursor.n) continue;
    const key = slot.area + ":" + slot.index;
    if (seen.has(key)) continue;
    seen.add(key);
    const current = getStack(slot);
    if (
      current === undefined ||
      !accepts(slot, cursor.id) ||
      (slot.area === "furnace" && !canInsertFurnaceSlot(slot.index, cursor.id)) ||
      (current && (current.id !== cursor.id || current.n >= maxStack(cursor.id)))
    )
      continue;
    accepted.push({ slot: { ...slot }, current });
  }
  const share = right ? 1 : Math.floor(cursor.n / accepted.length);
  let remaining = cursor.n;
  const slots = accepted.map(({ slot, current }) => {
    const added = Math.min(share, maxStack(cursor.id) - (current?.n ?? 0), remaining);
    remaining -= added;
    return { slot, stack: { id: cursor.id, n: (current?.n ?? 0) + added }, added };
  });
  return { slots, cursor: remaining ? { id: cursor.id, n: remaining } : null };
}

function inventoryAccess(pack: InventoryPack, chest?: ChestSlots, furnace?: ChestSlots) {
  const cells = (ref: SlotRef): (Stack | null)[] | undefined => {
    if (!validSlotRef(ref)) return undefined;
    if (ref.area === "chest") return chest;
    if (ref.area === "furnace") return furnace;
    if (ref.area === "grid") return ref.index < pack.size * pack.size ? pack.grid : undefined;
    return ref.area === "slots" ? pack.slots : undefined;
  };
  const accepts = (ref: SlotRef, id: number) =>
    !!cells(ref) && (ref.area !== "furnace" || canInsertFurnaceSlot(ref.index, id));
  return { cells, accepts };
}

/** Shared by local play and the authoritative room; never trusts client item counts. */
export function applyInventoryGesture(
  pack: InventoryPack,
  gesture: InventoryGesture,
  chest?: ChestSlots,
  furnace?: ChestSlots,
): boolean {
  if (!validGesture(gesture)) return false;
  const { cells, accepts } = inventoryAccess(pack, chest, furnace);
  const click = (ref: SlotRef, right = false) => {
    const list = cells(ref)!;
    if (pack.cursor && !accepts(ref, pack.cursor.id)) {
      // A read-only output can still be taken onto a matching held stack.
      const source = list[ref.index];
      if (ref.area !== "furnace" || ref.index !== 2 || !source || source.id !== pack.cursor.id)
        return false;
      const n = Math.min(source.n, maxStack(source.id) - pack.cursor.n);
      pack.cursor.n += n;
      source.n -= n;
      if (!source.n) list[ref.index] = null;
      return true;
    }
    const result = clickStack(list[ref.index], pack.cursor, right);
    list[ref.index] = result.slot;
    pack.cursor = result.cursor;
    return true;
  };
  if (gesture.type === "distribute") {
    if (!pack.cursor || gesture.slots.some((ref) => !cells(ref))) return false;
    const plan = planDistribution(
      pack.cursor,
      gesture.slots,
      (ref) => cells(ref)?.[ref.index],
      accepts,
      !!gesture.right,
    );
    for (const change of plan.slots) cells(change.slot)![change.slot.index] = change.stack;
    pack.cursor = plan.cursor;
    return true;
  }
  if (gesture.type === "collect") {
    if (pack.cursor && pack.cursor.id !== gesture.id) return false;
    let amount = pack.cursor?.n ?? 0;
    const lists = [...(chest ? [chest] : []), ...(furnace ? [furnace] : []), pack.slots, pack.grid];
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
    if (pack.cursor) return click(gesture.to);
    if (gesture.from.area === gesture.to.area && gesture.from.index === gesture.to.index)
      return true;
    if (!source || !accepts(gesture.to, source.id)) return false;
    const target = to[gesture.to.index];
    if (!target || target.id === source.id) {
      const n = Math.min(source.n, maxStack(source.id) - (target?.n ?? 0));
      if (n) to[gesture.to.index] = { id: source.id, n: (target?.n ?? 0) + n };
      source.n -= n;
      if (!source.n) from[gesture.from.index] = null;
    } else {
      if (!accepts(gesture.from, target.id)) return false;
      from[gesture.from.index] = target;
      to[gesture.to.index] = source;
    }
    return true;
  }
  const list = cells(gesture.slot);
  if (!list) return false;
  const stack = list[gesture.slot.index];
  if (!gesture.quick || !stack) return click(gesture.slot, !!gesture.right);
  if (
    gesture.slot.area === "grid" ||
    gesture.slot.area === "chest" ||
    gesture.slot.area === "furnace"
  ) {
    stack.n = pack.insert(stack.id, stack.n);
    if (!stack.n) list[gesture.slot.index] = null;
    return true;
  }
  const destinations: SlotRef[] = chest
    ? chest.map((_, index) => ({ area: "chest", index }))
    : furnace && furnaceRecipe(stack.id)
      ? [{ area: "furnace", index: 0 }]
      : furnace && furnaceFuelSeconds(stack.id) > 0
        ? [{ area: "furnace", index: 1 }]
        : Array.from({ length: gesture.slot.index < 9 ? 27 : 9 }, (_, i) => ({
            area: "slots",
            index: i + (gesture.slot.index < 9 ? 9 : 0),
          }));
  for (const empty of [false, true])
    for (const dest of destinations) {
      const targetList = cells(dest)!,
        target = targetList[dest.index];
      if (!stack.n || !accepts(dest, stack.id) || (empty ? !!target : target?.id !== stack.id))
        continue;
      const n = Math.min(stack.n, maxStack(stack.id) - (target?.n ?? 0));
      if (n) targetList[dest.index] = { id: stack.id, n: (target?.n ?? 0) + n };
      stack.n -= n;
    }
  if (!stack.n) list[gesture.slot.index] = null;
  return true;
}

/** Caller must authorize access to the relevant crafting grid before invoking this. */
export function applyCraftResult(
  pack: InventoryPack,
  options: { quick?: boolean; to?: SlotRef; expected?: Stack | null } = {},
  chest?: ChestSlots,
  furnace?: ChestSlots,
): boolean {
  if (
    (options.quick !== undefined && typeof options.quick !== "boolean") ||
    !expectedStack(options.expected)
  )
    return false;
  const recipe = pack.recipe();
  if (
    !recipe ||
    (options.expected !== undefined &&
      (recipe.out !== options.expected?.id || recipe.n !== options.expected?.n))
  )
    return false;
  if (!options.to) return pack.takeResult(false, !!options.quick);
  if (pack.cursor || options.quick) return false;
  const { cells, accepts } = inventoryAccess(pack, chest, furnace),
    targetList = cells(options.to);
  if (!targetList || !accepts(options.to, recipe.out)) return false;
  const target = targetList[options.to.index];
  if ((target && target.id !== recipe.out) || maxStack(recipe.out) - (target?.n ?? 0) < recipe.n)
    return false;
  if (!pack.takeResult()) return false;
  targetList[options.to.index] = { id: recipe.out, n: (target?.n ?? 0) + recipe.n };
  pack.cursor = null;
  return true;
}
