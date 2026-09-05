export { miningDuration } from "./mining";
export type Weapon = {
  damage: number;
  cooldown: number;
  reach: number;
  stamina: number;
  knockback: number;
  shieldBreak?: boolean;
};
const bare: Weapon = { damage: 2, cooldown: 0.48, reach: 3.1, stamina: 10, knockback: 2 };
export const WEAPONS: Record<number, Weapon> = {
  104: { damage: 6, cooldown: 0.6, reach: 3.6, stamina: 17, knockback: 3.5 },
  108: { damage: 7, cooldown: 0.6, reach: 3.6, stamina: 17, knockback: 3.8 },
  127: { damage: 9, cooldown: 1.05, reach: 3.2, stamina: 28, knockback: 5, shieldBreak: true },
  128: { damage: 4, cooldown: 0.85, reach: 3.2, stamina: 20, knockback: 3 },
  129: { damage: 5, cooldown: 0.88, reach: 4.6, stamina: 22, knockback: 4 },
  101: { damage: 2, cooldown: 0.8, reach: 3.1, stamina: 13, knockback: 2 },
  102: { damage: 3, cooldown: 0.8, reach: 3.1, stamina: 14, knockback: 2.5 },
  103: { damage: 4, cooldown: 0.8, reach: 3.1, stamina: 15, knockback: 3 },
  131: { damage: 4, cooldown: 0.8, reach: 3.1, stamina: 15, knockback: 2.8 },
  132: { damage: 2, cooldown: 0.5, reach: 3.1, stamina: 10, knockback: 1.5 },
  155: { damage: 2, cooldown: 0.7, reach: 3.1, stamina: 12, knockback: 2 },
  156: { damage: 4, cooldown: 0.5, reach: 3.6, stamina: 14, knockback: 3 },
  157: { damage: 7, cooldown: 0.9, reach: 3.2, stamina: 23, knockback: 4, shieldBreak: true },
  158: { damage: 3, cooldown: 0.85, reach: 3.1, stamina: 13, knockback: 2 },
  159: { damage: 2, cooldown: 0.5, reach: 3.1, stamina: 10, knockback: 2 },
  160: { damage: 10, cooldown: 0.95, reach: 3.2, stamina: 28, knockback: 5, shieldBreak: true },
  161: { damage: 5, cooldown: 0.8, reach: 3.1, stamina: 15, knockback: 3 },
  162: { damage: 3, cooldown: 0.4, reach: 3.1, stamina: 10, knockback: 2 },
};
export const weapon = (id: number) => WEAPONS[id] ?? bare;
