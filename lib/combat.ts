import { BLOCKS } from "./blocks";
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
};
export const weapon = (id: number) => WEAPONS[id] ?? bare;
const logs = [5, 25, 43, 47, 49, 52, 76],
  wood = [...logs, 8, 44, 51, 78, 86, 28, 30, 61, 62],
  soil = [1, 2, 4, 17, 42, 54, 63],
  stone = [
    3, 9, 12, 14, 16, 20, 21, 22, 23, 27, 29, 35, 36, 39, 40, 41, 45, 55, 56, 57, 58, 67, 68, 69,
    70, 71, 72, 73, 74, 75, 80, 81, 83, 85,
  ];
export function miningDuration(block: number, held: number) {
  let seconds = BLOCKS[block]?.hardness ?? 0.7;
  let speed = 1;
  if ([101, 102, 103].includes(held) && stone.includes(block))
    speed = held === 103 ? 6 : held === 102 ? 3.2 : 2;
  if ([127, 128].includes(held) && wood.includes(block)) speed = held === 127 ? 5 : 2.5;
  if (held === 130 && soil.includes(block)) speed = 4;
  if (
    [104, 108].includes(held) &&
    (BLOCKS[block]?.plant || [6, 26, 46, 50, 53, 77].includes(block))
  )
    speed = 1.6;
  return Math.max(0.08, seconds / speed);
}
