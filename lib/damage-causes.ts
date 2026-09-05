export const DAMAGE_CAUSES = {
  fall: "Upadek z wysokości",
  drowning: "Brak powietrza pod wodą",
  lava: "Lawa",
  cactus: "Kolce kaktusa",
  fire: "Ogień",
  void: "Upadek poza świat",
  hunger: "Głód — zjedz coś",
  mob: "Atak stworzenia",
  projectile: "Wrogi pocisk",
  explosion: "Eksplozja",
  pvp: "Atak innego gracza",
  horror: "Gość",
  environment: "Zagrożenie otoczenia",
} as const;
export type DamageCause = keyof typeof DAMAGE_CAUSES;
export function damageCauseLabel(cause: unknown): string | null {
  return typeof cause === "string" && Object.hasOwn(DAMAGE_CAUSES, cause)
    ? DAMAGE_CAUSES[cause as DamageCause]
    : null;
}
