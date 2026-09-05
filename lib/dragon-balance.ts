export const DRAGON_MAX_HEALTH = 600;
export const DRAGON_ENRAGED_HEALTH = DRAGON_MAX_HEALTH * 0.5;

/** Keep the fraction of health when upgrading a saved 300-HP encounter. */
export function restoreDragonHealth(hp: unknown, previousMax: unknown = 300, defeated = false) {
  if (defeated) return 0;
  if (typeof hp !== "number" || !Number.isFinite(hp)) return DRAGON_MAX_HEALTH;
  const maximum =
    typeof previousMax === "number" && Number.isFinite(previousMax) && previousMax > 0
      ? previousMax
      : 300;
  return Math.max(0, Math.min(DRAGON_MAX_HEALTH, (hp / maximum) * DRAGON_MAX_HEALTH));
}
