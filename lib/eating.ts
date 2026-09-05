export const EAT_DURATION = 1.6;
export type FoodId = 106 | 107;
export type EatingState = { id: FoodId; elapsed: number };
export type EatingWire = { id: FoodId; progress: number };

export function isFood(id: unknown): id is FoodId {
  return id === 106 || id === 107;
}
export function eatingProgress(state: EatingState | null | undefined) {
  return state && isFood(state.id) && Number.isFinite(state.elapsed) && state.elapsed >= 0
    ? Math.min(1, state.elapsed / EAT_DURATION)
    : -1;
}
export function validEatingWire(value: unknown): value is EatingWire {
  if (!value || typeof value !== "object") return false;
  const state = value as EatingWire;
  return (
    isFood(state.id) &&
    Number.isFinite(state.progress) &&
    state.progress >= 0 &&
    state.progress <= 1
  );
}
/** Bite peaks at 22%, 40%, 58%, 76% and 94%; a negative value means the hand is still rising. */
export function eatingBite(progress: number) {
  return Number.isFinite(progress) && progress >= 0.22 && progress <= 1
    ? Math.min(4, Math.floor((progress - 0.22 + 1e-8) / 0.18))
    : -1;
}
/** Five small bites, with a soft raise and release; this never uses the mining downstroke. */
export function eatingMotion(progress: number) {
  if (!Number.isFinite(progress) || progress < 0 || progress > 1) return { blend: 0, bite: 0 };
  const smooth = (value: number) => {
    const n = Math.max(0, Math.min(1, value));
    return n * n * (3 - 2 * n);
  };
  const blend = smooth(progress / 0.14) * smooth((1 - progress) / 0.09);
  const bite = (0.5 - 0.5 * Math.cos((Math.max(0, progress - 0.13) * Math.PI * 2) / 0.18)) * blend;
  return { blend, bite };
}
