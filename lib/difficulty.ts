export const DIFFICULTIES = ["easy", "normal", "hard", "horror"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export function normalizeDifficulty(value: unknown, fallback: Difficulty = "normal"): Difficulty {
  return DIFFICULTIES.includes(value as Difficulty) ? (value as Difficulty) : fallback;
}
const RULES = {
  easy: {
    environmentDamage: 0.65,
    hungerRate: 0.65,
    regenerationSeconds: 4,
    regenerationAmount: 1,
  },
  normal: { environmentDamage: 1, hungerRate: 1, regenerationSeconds: 6, regenerationAmount: 1 },
  hard: {
    environmentDamage: 1.35,
    hungerRate: 1.25,
    regenerationSeconds: 9,
    regenerationAmount: 1,
  },
  horror: {
    environmentDamage: 1.45,
    hungerRate: 1.3,
    regenerationSeconds: 10,
    regenerationAmount: 1,
  },
} as const;
export function difficultyRules(value: unknown) {
  return RULES[normalizeDifficulty(value)];
}
