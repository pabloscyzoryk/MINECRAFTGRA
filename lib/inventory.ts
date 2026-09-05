import { BLOCKS, ITEMS } from "./blocks";
export type Stack = { id: number; n: number };
export type PackData = {
  slots: (Stack | null)[];
  grid: (Stack | null)[];
  cursor: Stack | null;
  size: number;
};
export type GridRecipe = {
  name: string;
  out: number;
  n: number;
  pattern: number[][];
  furnace?: boolean;
};
export const maxStack = (id: number) =>
  [101, 102, 103, 104, 105, 108, 115, 118, 121, 122, 123, 126, 127, 128, 129, 130].includes(id)
    ? 1
    : id === 114
      ? 16
      : 64;
const wood = [8, 44, 51, 78, 86],
  logs = [5, 25, 43, 47, 49, 52, 76],
  planks = [8, 8, 44, 8, 51, 86, 78];
export const GRID_RECIPES: GridRecipe[] = [
  {
    name: "Tarcza",
    out: 126,
    n: 1,
    pattern: [
      [-1, 110, -1],
      [-1, -1, -1],
      [0, -1, 0],
    ],
  },
  {
    name: "Żelazna siekiera",
    out: 127,
    n: 1,
    pattern: [
      [110, 110],
      [110, 112],
      [0, 112],
    ],
  },
  {
    name: "Drewniana siekiera",
    out: 128,
    n: 1,
    pattern: [
      [-1, -1],
      [-1, 112],
      [0, 112],
    ],
  },
  {
    name: "Włócznia",
    out: 129,
    n: 1,
    pattern: [
      [0, 0, 110],
      [0, 112, 0],
      [112, 0, 0],
    ],
  },
  { name: "Łopata", out: 130, n: 1, pattern: [[110], [112], [112]] },
  ...logs.map((id, i) => ({
    name: "Deski",
    out: planks[i],
    n: 4,
    pattern: [[id]],
  })),
  { name: "Patyki", out: 112, n: 4, pattern: [[-1], [-1]] },
  {
    name: "Stół rzemieślniczy",
    out: 28,
    n: 1,
    pattern: [
      [-1, -1],
      [-1, -1],
    ],
  },
  ...[101, 102, 103].map((id, i) => ({
    name: "Kilof",
    out: id,
    n: 1,
    pattern: [
      [[-1, 9, 111][i], [-1, 9, 111][i], [-1, 9, 111][i]],
      [0, 112, 0],
      [0, 112, 0],
    ],
  })),
  ...[104, 108].map((id, i) => ({
    name: "Miecz",
    out: id,
    n: 1,
    pattern: [[[110, 111][i]], [[110, 111][i]], [112]],
  })),
  {
    name: "Motyka",
    out: 118,
    n: 1,
    pattern: [
      [9, 9],
      [0, 112],
      [0, 112],
    ],
  },
  {
    name: "Piec",
    out: 29,
    n: 1,
    pattern: [
      [9, 9, 9],
      [9, 0, 9],
      [9, 9, 9],
    ],
  },
  {
    name: "Skrzynia",
    out: 61,
    n: 1,
    pattern: [
      [-1, -1, -1],
      [-1, 0, -1],
      [-1, -1, -1],
    ],
  },
  {
    name: "Łóżko",
    out: 62,
    n: 1,
    pattern: [
      [32, 32, 32],
      [-1, -1, -1],
    ],
  },
  {
    name: "Wiadro",
    out: 114,
    n: 1,
    pattern: [
      [110, 0, 110],
      [0, 110, 0],
    ],
  },
  {
    name: "Krzesiwo",
    out: 123,
    n: 1,
    pattern: [
      [110, 0],
      [0, 124],
    ],
  },
  { name: "Chleb", out: 107, n: 1, pattern: [[117, 117, 117]] },
  { name: "Strzały", out: 113, n: 8, pattern: [[9], [112]] },
  {
    name: "Łuk",
    out: 105,
    n: 1,
    pattern: [
      [0, 112, 110],
      [112, 0, 110],
      [0, 112, 110],
    ],
  },
  { name: "Pochodnie", out: 48, n: 4, pattern: [[109], [112]] },
  ...[121, 122].map((id, i) => ({
    name: "Napierśnik",
    out: id,
    n: 1,
    pattern: [
      [[110, 111][i], 0, [110, 111][i]],
      Array(3).fill([110, 111][i]),
      Array(3).fill([110, 111][i]),
    ],
  })),
  { name: "Żelazo", out: 110, n: 1, pattern: [[21, 109]], furnace: true },
  { name: "Miedź", out: 120, n: 1, pattern: [[80, 109]], furnace: true },
  { name: "Szkło", out: 10, n: 1, pattern: [[4, 109]], furnace: true },
  ...[
    [111, 34],
    [120, 81],
  ].map(([id, out]) => ({
    name: "Blok surowca",
    out,
    n: 1,
    pattern: Array.from({ length: 3 }, () => [id, id, id]),
  })),
];
const matches = (id: number, token: number) => (token === -1 ? wood.includes(id) : id === token);
export class InventoryPack {
  slots: (Stack | null)[] = Array(36).fill(null);
  grid: (Stack | null)[] = Array(9).fill(null);
  cursor: Stack | null = null;
  size = 2;
  reset() {
    this.slots = Array(36).fill(null);
    this.grid = Array(9).fill(null);
    this.cursor = null;
    this.size = 2;
  }
  snapshot(): PackData {
    return {
      slots: this.slots.map((s) => (s ? { ...s } : null)),
      grid: this.grid.map((s) => (s ? { ...s } : null)),
      cursor: this.cursor ? { ...this.cursor } : null,
      size: this.size,
    };
  }
  counts() {
    const out: Record<number, number> = {};
    for (const s of [...this.slots, ...this.grid, this.cursor])
      if (s) out[s.id] = (out[s.id] ?? 0) + s.n;
    return out;
  }
  capacity(id: number) {
    return this.slots.reduce(
      (n, s) => n + (!s ? maxStack(id) : s.id === id ? maxStack(id) - s.n : 0),
      0,
    );
  }
  insert(id: number, n: number, preferred = -1) {
    const order = [...new Set([preferred, ...Array.from({ length: 36 }, (_, i) => i)])].filter(
      (i) => i >= 0 && i < 36,
    );
    for (const i of order) {
      const s = this.slots[i];
      if (s?.id === id) {
        const put = Math.min(n, maxStack(id) - s.n);
        s.n += put;
        n -= put;
        if (!n) return 0;
      }
    }
    for (const i of order)
      if (!this.slots[i]) {
        const put = Math.min(n, maxStack(id));
        this.slots[i] = { id, n: put };
        n -= put;
        if (!n) return 0;
      }
    return n;
  }
  remove(id: number, n: number, preferred = -1) {
    const order = [...new Set([preferred, ...Array.from({ length: 36 }, (_, i) => i)])].filter(
      (i) => i >= 0 && i < 36,
    );
    for (const i of order) {
      const s = this.slots[i];
      if (s?.id === id) {
        const take = Math.min(n, s.n);
        s.n -= take;
        n -= take;
        if (!s.n) this.slots[i] = null;
        if (!n) return;
      }
    }
    for (let i = 0; i < 9; i++) {
      const s = this.grid[i];
      if (s?.id === id) {
        const take = Math.min(n, s.n);
        s.n -= take;
        n -= take;
        if (!s.n) this.grid[i] = null;
      }
    }
    if (this.cursor?.id === id) {
      this.cursor.n = Math.max(0, this.cursor.n - n);
      if (!this.cursor.n) this.cursor = null;
    }
  }
  reconcile(wanted: Record<number, number>, preferred = -1) {
    const actual = this.counts(),
      overflow: Stack[] = [];
    for (const [id, n] of Object.entries(actual)) {
      const target = Math.max(0, Math.floor(wanted[+id] ?? 0));
      if (target < n) this.remove(+id, n - target, preferred);
    }
    for (const [id, n] of Object.entries(wanted)) {
      const delta = Math.max(0, Math.floor(n)) - (actual[+id] ?? 0);
      if (delta > 0) {
        const left = this.insert(+id, delta, preferred);
        if (left) overflow.push({ id: +id, n: left });
      }
    }
    return overflow;
  }
  click(area: "slots" | "grid", index: number, right = false, quick = false) {
    const cells = this[area];
    if (index < 0 || index >= cells.length || (area === "grid" && index >= this.size * this.size))
      return;
    const s = cells[index];
    if (quick && area === "slots" && s) {
      const dest =
        index < 9
          ? Array.from({ length: 27 }, (_, i) => i + 9)
          : Array.from({ length: 9 }, (_, i) => i);
      for (const i of dest) {
        const target = this.slots[i];
        if (target?.id === s.id) {
          const put = Math.min(s.n, maxStack(s.id) - target.n);
          s.n -= put;
          target.n += put;
        }
      }
      for (const i of dest)
        if (!this.slots[i] && s.n) {
          this.slots[i] = { ...s };
          s.n = 0;
        }
      if (!s.n) cells[index] = null;
      return;
    }
    if (!this.cursor) {
      if (s) {
        const n = right ? Math.ceil(s.n / 2) : s.n;
        this.cursor = { id: s.id, n };
        s.n -= n;
        if (!s.n) cells[index] = null;
      }
      return;
    }
    if (!s) {
      const n = right ? 1 : this.cursor.n;
      cells[index] = { id: this.cursor.id, n };
      this.cursor.n -= n;
    } else if (s.id === this.cursor.id) {
      const n = Math.min(right ? 1 : this.cursor.n, maxStack(s.id) - s.n);
      s.n += n;
      this.cursor.n -= n;
    } else if (!right) {
      cells[index] = this.cursor;
      this.cursor = s;
      return;
    }
    if (!this.cursor.n) this.cursor = null;
  }
  move(fromArea: "slots" | "grid", from: number, toArea: "slots" | "grid", to: number) {
    if (this.cursor) return;
    this.click(fromArea, from);
    this.click(toArea, to);
    if (this.cursor) this.click(fromArea, from);
  }
  clearGrid() {
    const left: Stack[] = [];
    for (let i = 0; i < 9; i++) {
      const s = this.grid[i];
      if (s) {
        const n = this.insert(s.id, s.n);
        if (n) left.push({ id: s.id, n });
        this.grid[i] = null;
      }
    }
    if (this.cursor) {
      const n = this.insert(this.cursor.id, this.cursor.n);
      if (n) left.push({ id: this.cursor.id, n });
      this.cursor = null;
    }
    return left;
  }
  recipe(furnace = false) {
    const occupied = this.grid
      .slice(0, this.size * this.size)
      .map((s, i) => (s ? i : -1))
      .filter((i) => i >= 0);
    if (!occupied.length) return null;
    const x0 = Math.min(...occupied.map((i) => i % this.size)),
      x1 = Math.max(...occupied.map((i) => i % this.size)),
      y0 = Math.min(...occupied.map((i) => Math.floor(i / this.size))),
      y1 = Math.max(...occupied.map((i) => Math.floor(i / this.size)));
    for (const recipe of GRID_RECIPES) {
      const p = recipe.pattern;
      if (p.length !== y1 - y0 + 1 || p[0].length !== x1 - x0 + 1 || (recipe.furnace && !furnace))
        continue;
      for (const mirror of [false, true]) {
        let valid = true;
        for (let y = 0; y < p.length; y++)
          for (let x = 0; x < p[0].length; x++) {
            const token = p[y][mirror ? p[0].length - 1 - x : x],
              s = this.grid[(y + y0) * this.size + x + x0];
            if (!matches(s?.id ?? 0, token)) valid = false;
          }
        if (valid) return recipe;
      }
    }
    return null;
  }
  takeResult(furnace = false, quick = false) {
    const r = this.recipe(furnace);
    if (!r) return false;
    if (quick) {
      if (this.capacity(r.out) < r.n) return false;
      this.insert(r.out, r.n);
    } else {
      if (this.cursor && (this.cursor.id !== r.out || this.cursor.n + r.n > maxStack(r.out)))
        return false;
      this.cursor = { id: r.out, n: (this.cursor?.n ?? 0) + r.n };
    }
    for (let i = 0; i < this.size * this.size; i++)
      if (this.grid[i] && --this.grid[i]!.n === 0) this.grid[i] = null;
    return true;
  }
  fillRecipe(index: number, creative = false) {
    const r = GRID_RECIPES[index];
    if (!r || r.pattern.length > this.size || r.pattern[0].length > this.size) return false;
    const available = this.counts(),
      chosen: number[][] = [];
    for (const row of r.pattern) {
      const line = [];
      for (const token of row) {
        if (!token) {
          line.push(0);
          continue;
        }
        const id =
          token === -1
            ? (wood.find((id) => (available[id] ?? 0) > 0) ?? (creative ? 8 : 0))
            : token;
        if (!id || (!creative && !(available[id] > 0))) return false;
        available[id] = (available[id] ?? 0) - 1;
        line.push(id);
      }
      chosen.push(line);
    }
    const before = this.snapshot();
    if (this.clearGrid().length) {
      this.restore(before);
      return false;
    }
    for (let y = 0; y < chosen.length; y++)
      for (let x = 0; x < chosen[y].length; x++) {
        const id = chosen[y][x];
        if (id) {
          if (!creative) this.remove(id, 1);
          this.grid[y * this.size + x] = { id, n: 1 };
        }
      }
    return true;
  }
  restore(data: Partial<PackData>) {
    const valid = (s: Stack | null | undefined) =>
      s &&
      Number.isInteger(s.id) &&
      s.id > 0 &&
      (BLOCKS[s.id] || ITEMS.some((i) => i.id === s.id)) &&
      Number.isFinite(s.n) &&
      s.n > 0
        ? { id: s.id, n: Math.min(maxStack(s.id), Math.floor(s.n)) }
        : null;
    this.reset();
    this.slots = this.slots.map((_, i) => valid(data.slots?.[i]));
    this.grid = this.grid.map((_, i) => valid(data.grid?.[i]));
    this.cursor = valid(data.cursor);
    this.size = data.size === 3 ? 3 : 2;
  }
}
