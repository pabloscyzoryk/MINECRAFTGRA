import { BLOCKS, ITEMS } from "./blocks";
import { maxStack, type Stack } from "./inventory";

export type FurnaceSlots = [Stack | null, Stack | null, Stack | null];
export type FurnaceState = {
  slots: FurnaceSlots;
  burnRemaining: number;
  burnTotal: number;
  progress: number;
  recipeId: number | null;
};
export type FurnaceRecipe = { input: number; output: number; seconds: number };
export const FURNACE_RECIPES: FurnaceRecipe[] = [
  { input: 21, output: 110, seconds: 10 },
  { input: 80, output: 120, seconds: 10 },
  { input: 87, output: 133, seconds: 10 },
  { input: 92, output: 138, seconds: 10 },
  { input: 93, output: 133, seconds: 10 },
  { input: 91, output: 137, seconds: 10 },
  { input: 4, output: 10, seconds: 10 },
  { input: 9, output: 3, seconds: 10 },
];
const wood = new Set([5, 8, 25, 43, 44, 47, 49, 51, 52, 76, 78, 86]);
const knownItem = (id: number) =>
  Number.isInteger(id) && id > 0 && (!!BLOCKS[id] || ITEMS.some((item) => item.id === id));
export function furnaceRecipe(id: number): FurnaceRecipe | null {
  return FURNACE_RECIPES.find((recipe) => recipe.input === id) ?? null;
}
export function furnaceFuelSeconds(id: number) {
  return id === 109 ? 80 : id === 112 ? 5 : wood.has(id) ? 15 : 0;
}
export function canInsertFurnaceSlot(index: number, id: number) {
  return index === 0 ? knownItem(id) : index === 1 && furnaceFuelSeconds(id) > 0;
}
export function createFurnace(): FurnaceState {
  return { slots: [null, null, null], burnRemaining: 0, burnTotal: 0, progress: 0, recipeId: null };
}
export function restoreFurnace(value: unknown): FurnaceState {
  const state = createFurnace(),
    data = value as Partial<FurnaceState> | null;
  if (!data || typeof data !== "object") return state;
  const finite = (n: unknown, max: number) =>
    typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0;
  for (let i = 0; i < 3; i++) {
    const stack = data.slots?.[i];
    if (stack && knownItem(stack.id) && Number.isFinite(stack.n) && stack.n >= 1)
      state.slots[i] = { id: stack.id, n: Math.min(maxStack(stack.id), Math.floor(stack.n)) };
  }
  state.burnTotal = finite(data.burnTotal, 80);
  state.burnRemaining = Math.min(state.burnTotal, finite(data.burnRemaining, 80));
  const input = state.slots[0];
  state.recipeId = input && furnaceRecipe(input.id) ? input.id : null;
  state.progress =
    data.recipeId === state.recipeId && state.recipeId !== null
      ? finite(data.progress, 9.999999)
      : 0;
  return state;
}

/** Advances loaded furnaces only; a long suspended frame cannot smelt an unlimited backlog. */
export function tickFurnace(state: FurnaceState, dt: number): boolean {
  let remaining = Number.isFinite(dt) ? Math.max(0, Math.min(30, dt)) : 0;
  if (!remaining) return false;
  const before = JSON.stringify(state);
  for (let step = 0; remaining > 0.000001 && step < 64; step++) {
    const input = state.slots[0],
      recipe = furnaceRecipe(input?.id ?? 0),
      output = state.slots[2];
    if (state.recipeId !== (recipe?.input ?? null)) {
      state.recipeId = recipe?.input ?? null;
      state.progress = 0;
    }
    const canSmelt = !!(
      input &&
      recipe &&
      (!output || (output.id === recipe.output && output.n < maxStack(output.id)))
    );
    if (state.burnRemaining <= 0.000001 && canSmelt) {
      const fuel = state.slots[1],
        seconds = furnaceFuelSeconds(fuel?.id ?? 0);
      if (fuel && seconds > 0) {
        if (--fuel.n === 0) state.slots[1] = null;
        state.burnRemaining = state.burnTotal = seconds;
      }
    }
    if (state.burnRemaining <= 0.000001) {
      state.burnRemaining = 0;
      state.progress = Math.max(0, state.progress - remaining * 2);
      break;
    }
    const elapsed = Math.min(
      remaining,
      state.burnRemaining,
      canSmelt ? recipe!.seconds - state.progress : Infinity,
    );
    if (elapsed <= 0) break;
    state.burnRemaining = Math.max(0, state.burnRemaining - elapsed);
    remaining -= elapsed;
    if (canSmelt) {
      state.progress += elapsed;
      if (state.progress >= recipe!.seconds - 0.000001) {
        state.slots[2] = { id: recipe!.output, n: (output?.n ?? 0) + 1 };
        if (--input!.n === 0) state.slots[0] = null;
        state.progress = 0;
        state.recipeId = state.slots[0]?.id ?? null;
      }
    }
  }
  return JSON.stringify(state) !== before;
}
