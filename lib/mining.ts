import { BLOCKS } from "./blocks";

export type MiningTool = "hand" | "pickaxe" | "axe" | "shovel" | "hoe" | "shears" | "sword";
export type MiningRule = {
  hardness: number;
  tool: MiningTool;
  tier?: number;
  noDrop?: boolean;
  leaves?: boolean;
  unbreakable?: boolean;
};
export type ToolRule = { kind: MiningTool; speed: number; tier: number };
const rule = (
  hardness: number,
  tool: MiningTool = "hand",
  tier = 0,
  extra: Partial<MiningRule> = {},
): MiningRule => ({ hardness, tool, tier, ...extra });
const untouchable = (): MiningRule => rule(0, "hand", 0, { unbreakable: true });
const leaf = (): MiningRule => rule(0.2, "hoe", 0, { leaves: true });

/** Explicit coverage of every world block. Seconds follow the 20-tick mining cadence. */
export const MINING_RULES: Record<number, MiningRule> = {
  0: untouchable(),
  1: rule(0.6, "shovel"),
  2: rule(0.5, "shovel"),
  3: rule(1.5, "pickaxe", 1),
  4: rule(0.5, "shovel"),
  5: rule(2, "axe"),
  6: leaf(),
  7: untouchable(),
  8: rule(2, "axe"),
  9: rule(2, "pickaxe", 1),
  10: rule(0.3, "hand", 0, { noDrop: true }),
  11: rule(2, "pickaxe", 1),
  12: rule(50, "pickaxe", 4),
  13: untouchable(),
  14: rule(0.4, "pickaxe", 1),
  15: untouchable(),
  16: rule(0.3),
  17: rule(3, "pickaxe", 1),
  18: untouchable(),
  19: rule(0.2, "shovel"),
  20: rule(3, "pickaxe", 1),
  21: rule(3, "pickaxe", 2),
  22: rule(3, "pickaxe", 3),
  23: rule(0.2, "axe"),
  24: rule(0.2, "axe"),
  25: rule(2, "axe"),
  26: leaf(),
  27: rule(0.8, "pickaxe", 1),
  28: rule(2.5, "axe"),
  29: rule(3.5, "pickaxe", 1),
  30: rule(1.5, "axe"),
  31: rule(0.8, "shears"),
  32: rule(0.8, "shears"),
  33: rule(3, "pickaxe", 3),
  34: rule(5, "pickaxe", 3),
  35: rule(1.25, "pickaxe", 1),
  36: rule(1.5, "pickaxe", 1),
  37: rule(5, "pickaxe", 3),
  38: rule(2, "pickaxe", 1),
  39: rule(0.8, "pickaxe", 1),
  40: rule(2, "pickaxe", 1),
  41: rule(0.4),
  42: rule(0.6, "shovel"),
  43: rule(2, "axe"),
  44: rule(2, "axe"),
  45: rule(0.8, "shears"),
  46: rule(0.8, "shears"),
  47: rule(2, "axe"),
  48: rule(3.5, "pickaxe", 1),
  49: rule(2, "axe"),
  50: leaf(),
  51: rule(2, "axe"),
  52: rule(2, "axe"),
  53: leaf(),
  54: rule(0.5, "shovel"),
  55: rule(0.5, "shovel"),
  56: rule(1.25, "pickaxe", 1),
  57: rule(1.25, "pickaxe", 1),
  58: rule(1.25, "pickaxe", 1),
  59: rule(1, "axe"),
  60: rule(0.5, "pickaxe", 0, { noDrop: true }),
  61: rule(2.5, "axe"),
  62: rule(0.2),
  63: rule(0.6, "shovel"),
  64: rule(0),
  65: rule(0),
  66: rule(0),
  67: rule(0),
  68: rule(0),
  69: rule(0),
  70: rule(0),
  71: rule(0.1, "hoe"),
  72: rule(0),
  73: rule(1.5, "pickaxe", 1),
  74: rule(0),
  75: rule(1.5, "pickaxe", 1),
  76: rule(2, "axe"),
  77: leaf(),
  78: rule(2, "axe"),
  79: rule(0),
  80: rule(3, "pickaxe", 2),
  81: rule(3, "pickaxe", 2),
  82: rule(3, "pickaxe", 1),
  83: rule(0.8, "pickaxe", 1),
  84: rule(4, "pickaxe", 2),
  85: rule(2, "pickaxe", 1),
  86: rule(2, "axe"),
  87: rule(3, "pickaxe", 3),
  88: rule(3, "pickaxe", 3),
  89: rule(3, "pickaxe", 2),
  90: rule(3, "pickaxe", 3),
  91: rule(3, "pickaxe", 1),
  92: rule(30, "pickaxe", 4),
  93: rule(3, "pickaxe", 1),
  94: rule(5, "pickaxe", 2),
  95: rule(5, "pickaxe", 1),
  96: rule(5, "pickaxe", 3),
  97: rule(3, "pickaxe", 2),
  98: rule(0.8, "pickaxe", 1),
  99: rule(50, "pickaxe", 4),
};
export const TOOL_RULES: Record<number, ToolRule> = {
  101: { kind: "pickaxe", speed: 2, tier: 1 },
  102: { kind: "pickaxe", speed: 4, tier: 2 },
  131: { kind: "pickaxe", speed: 6, tier: 3 },
  103: { kind: "pickaxe", speed: 8, tier: 4 },
  128: { kind: "axe", speed: 2, tier: 1 },
  127: { kind: "axe", speed: 6, tier: 3 },
  130: { kind: "shovel", speed: 6, tier: 3 },
  118: { kind: "hoe", speed: 4, tier: 2 },
  132: { kind: "shears", speed: 5, tier: 0 },
  104: { kind: "sword", speed: 1.5, tier: 3 },
  108: { kind: "sword", speed: 1.5, tier: 4 },
  155: { kind: "pickaxe", speed: 12, tier: 1 },
  156: { kind: "sword", speed: 1.5, tier: 1 },
  157: { kind: "axe", speed: 12, tier: 1 },
  158: { kind: "shovel", speed: 12, tier: 1 },
  159: { kind: "hoe", speed: 12, tier: 1 },
  160: { kind: "axe", speed: 8, tier: 4 },
  161: { kind: "shovel", speed: 8, tier: 4 },
  162: { kind: "hoe", speed: 8, tier: 4 },
};
const hand: ToolRule = { kind: "hand", speed: 1, tier: 0 };
const toolFor = (held: number) => TOOL_RULES[held] ?? hand;
export function isMineableBlock(block: number, y = 1) {
  return y >= 1 && !!MINING_RULES[block] && !MINING_RULES[block].unbreakable;
}
function sufficient(rule: MiningRule, tool: ToolRule) {
  return !rule.tier || (tool.kind === rule.tool && tool.tier >= rule.tier);
}
export function harvestAllowed(block: number, held: number) {
  const blockRule = MINING_RULES[block],
    tool = toolFor(held);
  return (
    !!blockRule &&
    !blockRule.unbreakable &&
    !blockRule.noDrop &&
    sufficient(blockRule, tool) &&
    (!blockRule.leaves || tool.kind === "shears")
  );
}
export function miningDuration(block: number, held: number) {
  const blockRule = MINING_RULES[block],
    tool = toolFor(held);
  if (!blockRule || blockRule.unbreakable) return Infinity;
  if (blockRule.hardness === 0 || (block === 59 && tool.kind === "sword")) return 0;
  let speed = tool.kind === blockRule.tool ? tool.speed : 1;
  if (blockRule.leaves && tool.kind === "shears") speed = 15;
  else if ((blockRule.leaves || blockRule.tool === "shears") && tool.kind === "sword") speed = 1.5;
  const seconds = (blockRule.hardness * (sufficient(blockRule, tool) ? 1.5 : 5)) / speed;
  return Math.max(0.05, Math.ceil((seconds - 1e-10) * 20) / 20);
}
export function harvestHint(block: number, held: number): string | null {
  const r = MINING_RULES[block];
  if (!r || r.unbreakable) return "Tego bloku nie można wydobyć.";
  if (r.noDrop) return "Ten blok rozbije się bez odzyskania przedmiotu.";
  if (r.leaves && toolFor(held).kind !== "shears")
    return "Nożyce pozwalają zebrać liście w całości.";
  if (!sufficient(r, toolFor(held))) {
    const names = ["", "drewniany kilof", "kamienny kilof", "żelazny kilof", "diamentowy kilof"];
    return `${BLOCKS[block].name}: potrzebny ${names[r.tier ?? 0]}, aby uzyskać surowiec.`;
  }
  return null;
}
/** Mineral products are shared by solo and online mining; ores that require a furnace stay ores. */
export function minedResource(block: number): { id: number; n: number } {
  const resources: Record<number, [number, number]> = {
    1: [2, 1],
    3: [9, 1],
    20: [109, 1],
    22: [111, 1],
    88: [134, 4],
    89: [135, 5],
    90: [136, 1],
    91: [137, 1],
    93: [133, 1],
  };
  const result = resources[block];
  return result ? { id: result[0], n: result[1] } : { id: block, n: 1 };
}
