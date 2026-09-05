// server/gateway.ts
import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { createClient } from "redis";
import { readFile, writeFile } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";

// server/room.ts
import * as THREE2 from "three";

// lib/blocks.ts
var b = (id, name, color, category = "Natura", extra = {}) => ({
  id,
  name,
  color,
  category,
  solid: true,
  hardness: 0.7,
  ...extra
});
var BLOCKS = [
  b(0, "Powietrze", "#ffffff", "", { solid: false }),
  b(1, "Trawa", "#87603c", "Natura", { top: "#79a548" }),
  b(2, "Ziemia", "#856043"),
  b(3, "Kamie\u0144", "#858c91"),
  b(4, "Piasek", "#dbc48a"),
  b(5, "D\u0105b", "#715336", "Drewno", { top: "#b09160" }),
  b(6, "Li\u015Bcie d\u0119bu", "#4e853a", "Natura"),
  b(7, "Woda", "#479fab", "Natura", { solid: false, transparent: true }),
  b(8, "Deski d\u0119bowe", "#b28b53", "Drewno"),
  b(9, "Bruk", "#7c8284", "Budowanie"),
  b(10, "Szk\u0142o", "#bee4e5", "Budowanie", { transparent: true }),
  b(11, "Ceg\u0142y", "#a25a44", "Budowanie"),
  b(12, "Obsydian", "#272237", "Wymiary", { hardness: 3 }),
  b(13, "Portal Netheru", "#9e42e1", "Wymiary", {
    solid: false,
    transparent: true,
    glow: true
  }),
  b(14, "Netherrack", "#80443f", "Wymiary"),
  b(15, "Lawa", "#fa7627", "Wymiary", { solid: false, glow: true }),
  b(16, "Jasnog\u0142az", "#e8c568", "Wymiary", { glow: true }),
  b(17, "Kamie\u0144 Endu", "#c9c798", "Wymiary"),
  b(18, "Portal Endu", "#163e43", "Wymiary", { solid: false, glow: true }),
  b(19, "\u015Anieg", "#e2eaf1"),
  b(20, "Ruda w\u0119gla", "#747b80", "Rudy"),
  b(21, "Ruda \u017Celaza", "#96908a", "Rudy"),
  b(22, "Ruda diamentu", "#73aaa4", "Rudy"),
  b(23, "Czerwony grzyb", "#bf4e43"),
  b(24, "\u0141odyga grzyba", "#d3cbb4"),
  b(25, "\u015Awierk", "#534636", "Drewno", { top: "#8b7654" }),
  b(26, "Igliwie", "#386b50"),
  b(27, "Piaskowiec", "#c4ad7b", "Budowanie"),
  b(28, "St\xF3\u0142 rzemie\u015Blniczy", "#a27145", "Budowanie", { top: "#765231" }),
  b(29, "Piec", "#575e61", "Budowanie"),
  b(30, "Biblioteczka", "#a67d4d", "Budowanie"),
  b(31, "Czerwona we\u0142na", "#b34a48", "Budowanie"),
  b(32, "Bia\u0142a we\u0142na", "#e3ded4", "Budowanie"),
  b(33, "Blok z\u0142ota", "#e5b84e", "Rudy"),
  b(34, "Blok diamentu", "#68c8c0", "Rudy"),
  b(35, "Bazalt", "#45404a", "Wymiary"),
  b(36, "Purpur", "#99779e", "Wymiary"),
  b(37, "Szmaragd", "#42b474", "Rudy"),
  b(38, "Ceg\u0142y Netheru", "#472c35", "Wymiary"),
  b(39, "Kwarc", "#e3d5c7", "Budowanie"),
  b(40, "Mechaty bruk", "#718068", "Budowanie"),
  b(41, "Kaktus", "#5d8242"),
  b(42, "\u017Bwir", "#979085"),
  b(43, "Brzoza", "#d8d3bd", "Drewno"),
  b(44, "Deski brzozowe", "#d5be82", "Drewno"),
  b(45, "Niebieska we\u0142na", "#4e6da4", "Budowanie"),
  b(46, "Pomara\u0144czowa we\u0142na", "#d28a43", "Budowanie"),
  b(47, "Ciemny d\u0105b", "#4e3d2d", "Drewno"),
  b(48, "Latarnia", "#ffd279", "Budowanie", { glow: true }),
  b(49, "Drewno wi\u015Bni", "#78514e", "Drewno", { top: "#d9a7a3" }),
  b(50, "Li\u015Bcie wi\u015Bni", "#e3a4bd"),
  b(51, "Deski wi\u015Bniowe", "#d8a0a6", "Drewno"),
  b(52, "Drewno namorzynowe", "#67403a", "Drewno"),
  b(53, "Li\u015Bcie namorzynu", "#73905a"),
  b(54, "B\u0142oto", "#5c635c"),
  b(55, "Czerwony piasek", "#c77d49"),
  b(56, "Terakota", "#b67755", "Budowanie"),
  b(57, "Bia\u0142a terakota", "#d6bfa7", "Budowanie"),
  b(58, "Ochrowa terakota", "#ce9e50", "Budowanie"),
  b(59, "Bambus", "#92ae51", "Natura", { plant: true, solid: false }),
  b(60, "L\xF3d", "#b6dfe9", "Natura", { transparent: true }),
  b(61, "Skrzynia", "#aa793f", "Budowanie"),
  b(62, "\u0141\xF3\u017Cko", "#bd6360", "Budowanie"),
  b(63, "Uprawna ziemia", "#62492f", "Natura"),
  b(64, "Kie\u0142kuj\u0105ca pszenica", "#7fa251", "Uprawy", {
    plant: true,
    solid: false
  }),
  b(65, "Rosn\u0105ca pszenica", "#a8b351", "Uprawy", { plant: true, solid: false }),
  b(66, "Dojrza\u0142a pszenica", "#d5b766", "Uprawy", {
    plant: true,
    solid: false
  }),
  b(67, "R\xF3\u017Cowe p\u0142atki", "#f0b5ca", "Natura", { plant: true, solid: false }),
  b(68, "Niebieski kwiat", "#7eabdc", "Natura", { plant: true, solid: false }),
  b(69, "\u017B\xF3\u0142ty kwiat", "#e4c864", "Natura", { plant: true, solid: false }),
  b(70, "Czerwony kwiat", "#d87770", "Natura", { plant: true, solid: false }),
  b(71, "Mech", "#829c53"),
  b(72, "\u015Awietlisty grzyb", "#9ecee3", "Natura", {
    plant: true,
    solid: false,
    glow: true
  }),
  b(73, "Ametyst", "#a597da", "Rudy", { glow: true }),
  b(74, "Koralowiec", "#e1a2b6", "Natura", { plant: true, solid: false }),
  b(75, "Naciek", "#aa8d6e"),
  b(76, "Drewno d\u017Cunglowe", "#836140", "Drewno"),
  b(77, "Li\u015Bcie d\u017Cunglowe", "#507847"),
  b(78, "Deski d\u017Cunglowe", "#ac805a", "Drewno"),
  b(79, "Wysoka trawa", "#8ba75b", "Natura", { plant: true, solid: false }),
  b(80, "Ruda miedzi", "#858b79", "Rudy"),
  b(81, "Blok miedzi", "#c38c66", "Rudy"),
  b(82, "G\u0142\u0119boka ska\u0142a", "#465663"),
  b(83, "Rze\u017Abiony piaskowiec", "#c7ac7d", "Budowanie"),
  b(84, "Pradawna runa", "#84baba", "Budowanie", { glow: true }),
  b(85, "Jasne ceg\u0142y", "#c2c3b6", "Budowanie"),
  b(86, "Deski namorzynowe", "#9d655a", "Drewno")
];
var ITEMS = [
  { id: 126, name: "Tarcza", color: "#b1c5c9", category: "Pancerz" },
  { id: 127, name: "\u017Belazna siekiera", color: "#c5d3d4", category: "Narz\u0119dzia" },
  { id: 128, name: "Drewniana siekiera", color: "#b68e54", category: "Narz\u0119dzia" },
  { id: 129, name: "W\u0142\xF3cznia", color: "#bfcbd3", category: "Narz\u0119dzia" },
  { id: 130, name: "\u017Belazna \u0142opata", color: "#beced2", category: "Narz\u0119dzia" },
  { id: 123, name: "Krzesiwo", color: "#9baab0", category: "Narz\u0119dzia" },
  { id: 124, name: "Krzemie\u0144", color: "#515865", category: "Surowce" },
  { id: 101, name: "Drewniany kilof", color: "#bb9568", category: "Narz\u0119dzia" },
  { id: 102, name: "Kamienny kilof", color: "#acb3b6", category: "Narz\u0119dzia" },
  {
    id: 103,
    name: "Diamentowy kilof",
    color: "#67e5d2",
    category: "Narz\u0119dzia"
  },
  { id: 104, name: "\u017Belazny miecz", color: "#d4e2e4", category: "Narz\u0119dzia" },
  { id: 105, name: "\u0141uk", color: "#c09863", category: "Narz\u0119dzia" },
  { id: 106, name: "Jab\u0142ko", color: "#e97b57", category: "Jedzenie" },
  { id: 107, name: "Chleb", color: "#d7a55a", category: "Jedzenie" },
  {
    id: 108,
    name: "Diamentowy miecz",
    color: "#6de2d3",
    category: "Narz\u0119dzia"
  },
  { id: 109, name: "W\u0119giel", color: "#55565a", category: "Surowce" },
  { id: 110, name: "\u017Belazo", color: "#bec1bf", category: "Surowce" },
  { id: 111, name: "Diament", color: "#5ce1d6", category: "Surowce" },
  { id: 112, name: "Patyk", color: "#a78453", category: "Surowce" },
  { id: 113, name: "Strza\u0142y", color: "#c7bd9c", category: "Surowce" },
  { id: 114, name: "Wiaderko", color: "#c5ced0", category: "Narz\u0119dzia" },
  { id: 115, name: "Wiadro wody", color: "#63c7e7", category: "Narz\u0119dzia" },
  { id: 116, name: "Nasiona pszenicy", color: "#a5bf79", category: "Uprawy" },
  { id: 117, name: "Pszenica", color: "#d7ba72", category: "Uprawy" },
  { id: 118, name: "Motyka", color: "#9aa59b", category: "Narz\u0119dzia" },
  { id: 119, name: "Pradawny relikt", color: "#b5d7c9", category: "Skarby" },
  { id: 120, name: "Sztabka miedzi", color: "#ce9876", category: "Surowce" },
  {
    id: 121,
    name: "\u017Belazny napier\u015Bnik",
    color: "#c9d5d6",
    category: "Pancerz"
  },
  {
    id: 122,
    name: "Diamentowy napier\u015Bnik",
    color: "#7adace",
    category: "Pancerz"
  }
];
var RECIPES = [
  ...[44, 51, 78, 86].flatMap((wood3) => [
    { out: 112, n: 4, need: [[wood3, 2]] },
    { out: 28, n: 1, need: [[wood3, 4]] },
    { out: 61, n: 1, need: [[wood3, 8]] },
    {
      out: 101,
      n: 1,
      need: [
        [wood3, 3],
        [112, 2]
      ]
    },
    {
      out: 62,
      n: 1,
      need: [
        [wood3, 3],
        [32, 3]
      ]
    }
  ]),
  { out: 51, n: 4, need: [[49, 1]] },
  { out: 78, n: 4, need: [[76, 1]] },
  { out: 86, n: 4, need: [[52, 1]] },
  { out: 8, n: 4, need: [[25, 1]] },
  { out: 8, n: 4, need: [[47, 1]] },
  { out: 61, n: 1, need: [[8, 8]] },
  {
    out: 62,
    n: 1,
    need: [
      [8, 3],
      [32, 3]
    ]
  },
  {
    out: 118,
    n: 1,
    need: [
      [9, 2],
      [112, 2]
    ]
  },
  { out: 107, n: 2, need: [[117, 3]] },
  {
    out: 120,
    n: 1,
    need: [
      [80, 1],
      [109, 1]
    ]
  },
  { out: 81, n: 1, need: [[120, 9]] },
  { out: 121, n: 1, need: [[110, 8]] },
  { out: 122, n: 1, need: [[111, 8]] },
  { out: 114, n: 1, need: [[110, 3]] },
  { out: 8, n: 4, need: [[5, 1]] },
  { out: 44, n: 4, need: [[43, 1]] },
  { out: 112, n: 4, need: [[8, 2]] },
  { out: 28, n: 1, need: [[8, 4]] },
  {
    out: 101,
    n: 1,
    need: [
      [8, 3],
      [112, 2]
    ]
  },
  {
    out: 102,
    n: 1,
    need: [
      [9, 3],
      [112, 2]
    ]
  },
  { out: 29, n: 1, need: [[9, 8]] },
  {
    out: 110,
    n: 1,
    need: [
      [21, 1],
      [109, 1]
    ]
  },
  {
    out: 104,
    n: 1,
    need: [
      [110, 2],
      [112, 1]
    ]
  },
  {
    out: 103,
    n: 1,
    need: [
      [111, 3],
      [112, 2]
    ]
  },
  {
    out: 108,
    n: 1,
    need: [
      [111, 2],
      [112, 1]
    ]
  },
  {
    out: 105,
    n: 1,
    need: [
      [112, 6],
      [110, 1]
    ]
  },
  {
    out: 113,
    n: 16,
    need: [
      [112, 2],
      [9, 2]
    ]
  },
  {
    out: 10,
    n: 8,
    need: [
      [4, 8],
      [109, 1]
    ]
  },
  {
    out: 11,
    n: 8,
    need: [
      [2, 8],
      [109, 1]
    ]
  },
  {
    out: 48,
    n: 4,
    need: [
      [109, 1],
      [112, 4]
    ]
  },
  {
    out: 13,
    n: 4,
    need: [
      [12, 6],
      [16, 2]
    ]
  },
  {
    out: 18,
    n: 4,
    need: [
      [17, 6],
      [111, 2]
    ]
  },
  { out: 34, n: 1, need: [[111, 9]] }
];

// lib/combat.ts
var bare = { damage: 2, cooldown: 0.48, reach: 3.1, stamina: 10, knockback: 2 };
var WEAPONS = {
  104: { damage: 6, cooldown: 0.6, reach: 3.6, stamina: 17, knockback: 3.5 },
  108: { damage: 7, cooldown: 0.6, reach: 3.6, stamina: 17, knockback: 3.8 },
  127: { damage: 9, cooldown: 1.05, reach: 3.2, stamina: 28, knockback: 5, shieldBreak: true },
  128: { damage: 4, cooldown: 0.85, reach: 3.2, stamina: 20, knockback: 3 },
  129: { damage: 5, cooldown: 0.88, reach: 4.6, stamina: 22, knockback: 4 },
  101: { damage: 2, cooldown: 0.8, reach: 3.1, stamina: 13, knockback: 2 },
  102: { damage: 3, cooldown: 0.8, reach: 3.1, stamina: 14, knockback: 2.5 },
  103: { damage: 4, cooldown: 0.8, reach: 3.1, stamina: 15, knockback: 3 }
};
var weapon = (id) => WEAPONS[id] ?? bare;
var logs = [5, 25, 43, 47, 49, 52, 76];
var wood = [...logs, 8, 44, 51, 78, 86, 28, 30, 61, 62];
var soil = [1, 2, 4, 17, 42, 54, 63];
var stone = [
  3,
  9,
  12,
  14,
  16,
  20,
  21,
  22,
  23,
  27,
  29,
  35,
  36,
  39,
  40,
  41,
  45,
  55,
  56,
  57,
  58,
  67,
  68,
  69,
  70,
  71,
  72,
  73,
  74,
  75,
  80,
  81,
  83,
  85
];
function miningDuration(block, held) {
  let seconds = BLOCKS[block]?.hardness ?? 0.7;
  let speed = 1;
  if ([101, 102, 103].includes(held) && stone.includes(block))
    speed = held === 103 ? 6 : held === 102 ? 3.2 : 2;
  if ([127, 128].includes(held) && wood.includes(block)) speed = held === 127 ? 5 : 2.5;
  if (held === 130 && soil.includes(block)) speed = 4;
  if ([104, 108].includes(held) && (BLOCKS[block]?.plant || [6, 26, 46, 50, 53, 77].includes(block)))
    speed = 1.6;
  return Math.max(0.08, seconds / speed);
}

// lib/inventory.ts
var maxStack = (id) => [101, 102, 103, 104, 105, 108, 115, 118, 121, 122, 123, 126, 127, 128, 129, 130].includes(id) ? 1 : id === 114 ? 16 : 64;
var wood2 = [8, 44, 51, 78, 86];
var logs2 = [5, 25, 43, 47, 49, 52, 76];
var planks = [8, 8, 44, 8, 51, 86, 78];
var GRID_RECIPES = [
  {
    name: "Tarcza",
    out: 126,
    n: 1,
    pattern: [
      [-1, 110, -1],
      [-1, -1, -1],
      [0, -1, 0]
    ]
  },
  {
    name: "\u017Belazna siekiera",
    out: 127,
    n: 1,
    pattern: [
      [110, 110],
      [110, 112],
      [0, 112]
    ]
  },
  {
    name: "Drewniana siekiera",
    out: 128,
    n: 1,
    pattern: [
      [-1, -1],
      [-1, 112],
      [0, 112]
    ]
  },
  {
    name: "W\u0142\xF3cznia",
    out: 129,
    n: 1,
    pattern: [
      [0, 0, 110],
      [0, 112, 0],
      [112, 0, 0]
    ]
  },
  { name: "\u0141opata", out: 130, n: 1, pattern: [[110], [112], [112]] },
  ...logs2.map((id, i) => ({
    name: "Deski",
    out: planks[i],
    n: 4,
    pattern: [[id]]
  })),
  { name: "Patyki", out: 112, n: 4, pattern: [[-1], [-1]] },
  {
    name: "St\xF3\u0142 rzemie\u015Blniczy",
    out: 28,
    n: 1,
    pattern: [
      [-1, -1],
      [-1, -1]
    ]
  },
  ...[101, 102, 103].map((id, i) => ({
    name: "Kilof",
    out: id,
    n: 1,
    pattern: [
      [[-1, 9, 111][i], [-1, 9, 111][i], [-1, 9, 111][i]],
      [0, 112, 0],
      [0, 112, 0]
    ]
  })),
  ...[104, 108].map((id, i) => ({
    name: "Miecz",
    out: id,
    n: 1,
    pattern: [[[110, 111][i]], [[110, 111][i]], [112]]
  })),
  {
    name: "Motyka",
    out: 118,
    n: 1,
    pattern: [
      [9, 9],
      [0, 112],
      [0, 112]
    ]
  },
  {
    name: "Piec",
    out: 29,
    n: 1,
    pattern: [
      [9, 9, 9],
      [9, 0, 9],
      [9, 9, 9]
    ]
  },
  {
    name: "Skrzynia",
    out: 61,
    n: 1,
    pattern: [
      [-1, -1, -1],
      [-1, 0, -1],
      [-1, -1, -1]
    ]
  },
  {
    name: "\u0141\xF3\u017Cko",
    out: 62,
    n: 1,
    pattern: [
      [32, 32, 32],
      [-1, -1, -1]
    ]
  },
  {
    name: "Wiadro",
    out: 114,
    n: 1,
    pattern: [
      [110, 0, 110],
      [0, 110, 0]
    ]
  },
  {
    name: "Krzesiwo",
    out: 123,
    n: 1,
    pattern: [
      [110, 0],
      [0, 124]
    ]
  },
  { name: "Chleb", out: 107, n: 1, pattern: [[117, 117, 117]] },
  { name: "Strza\u0142y", out: 113, n: 8, pattern: [[9], [112]] },
  {
    name: "\u0141uk",
    out: 105,
    n: 1,
    pattern: [
      [0, 112, 110],
      [112, 0, 110],
      [0, 112, 110]
    ]
  },
  { name: "Pochodnie", out: 48, n: 4, pattern: [[109], [112]] },
  ...[121, 122].map((id, i) => ({
    name: "Napier\u015Bnik",
    out: id,
    n: 1,
    pattern: [
      [[110, 111][i], 0, [110, 111][i]],
      Array(3).fill([110, 111][i]),
      Array(3).fill([110, 111][i])
    ]
  })),
  { name: "\u017Belazo", out: 110, n: 1, pattern: [[21, 109]], furnace: true },
  { name: "Mied\u017A", out: 120, n: 1, pattern: [[80, 109]], furnace: true },
  { name: "Szk\u0142o", out: 10, n: 1, pattern: [[4, 109]], furnace: true },
  ...[
    [111, 34],
    [120, 81]
  ].map(([id, out]) => ({
    name: "Blok surowca",
    out,
    n: 1,
    pattern: Array.from({ length: 3 }, () => [id, id, id])
  }))
];
var matches = (id, token) => token === -1 ? wood2.includes(id) : id === token;
var InventoryPack = class {
  slots = Array(36).fill(null);
  grid = Array(9).fill(null);
  cursor = null;
  size = 2;
  reset() {
    this.slots = Array(36).fill(null);
    this.grid = Array(9).fill(null);
    this.cursor = null;
    this.size = 2;
  }
  snapshot() {
    return {
      slots: this.slots.map((s) => s ? { ...s } : null),
      grid: this.grid.map((s) => s ? { ...s } : null),
      cursor: this.cursor ? { ...this.cursor } : null,
      size: this.size
    };
  }
  counts() {
    const out = {};
    for (const s of [...this.slots, ...this.grid, this.cursor])
      if (s) out[s.id] = (out[s.id] ?? 0) + s.n;
    return out;
  }
  capacity(id) {
    return this.slots.reduce(
      (n, s) => n + (!s ? maxStack(id) : s.id === id ? maxStack(id) - s.n : 0),
      0
    );
  }
  insert(id, n, preferred = -1) {
    const order = [.../* @__PURE__ */ new Set([preferred, ...Array.from({ length: 36 }, (_, i) => i)])].filter(
      (i) => i >= 0 && i < 36
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
  remove(id, n, preferred = -1) {
    const order = [.../* @__PURE__ */ new Set([preferred, ...Array.from({ length: 36 }, (_, i) => i)])].filter(
      (i) => i >= 0 && i < 36
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
  reconcile(wanted, preferred = -1) {
    const actual = this.counts(), overflow = [];
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
  click(area, index, right = false, quick = false) {
    const cells = this[area];
    if (index < 0 || index >= cells.length || area === "grid" && index >= this.size * this.size)
      return;
    const s = cells[index];
    if (quick && area === "slots" && s) {
      const dest = index < 9 ? Array.from({ length: 27 }, (_, i) => i + 9) : Array.from({ length: 9 }, (_, i) => i);
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
  move(fromArea, from, toArea, to) {
    if (this.cursor) return;
    this.click(fromArea, from);
    this.click(toArea, to);
    if (this.cursor) this.click(fromArea, from);
  }
  clearGrid() {
    const left = [];
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
    const occupied = this.grid.slice(0, this.size * this.size).map((s, i) => s ? i : -1).filter((i) => i >= 0);
    if (!occupied.length) return null;
    const x0 = Math.min(...occupied.map((i) => i % this.size)), x1 = Math.max(...occupied.map((i) => i % this.size)), y0 = Math.min(...occupied.map((i) => Math.floor(i / this.size))), y1 = Math.max(...occupied.map((i) => Math.floor(i / this.size)));
    for (const recipe of GRID_RECIPES) {
      const p = recipe.pattern;
      if (p.length !== y1 - y0 + 1 || p[0].length !== x1 - x0 + 1 || recipe.furnace && !furnace)
        continue;
      for (const mirror of [false, true]) {
        let valid = true;
        for (let y = 0; y < p.length; y++)
          for (let x = 0; x < p[0].length; x++) {
            const token = p[y][mirror ? p[0].length - 1 - x : x], s = this.grid[(y + y0) * this.size + x + x0];
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
      if (this.grid[i] && --this.grid[i].n === 0) this.grid[i] = null;
    return true;
  }
  fillRecipe(index, creative = false) {
    const r = GRID_RECIPES[index];
    if (!r || r.pattern.length > this.size || r.pattern[0].length > this.size) return false;
    const available = this.counts(), chosen = [];
    for (const row of r.pattern) {
      const line = [];
      for (const token of row) {
        if (!token) {
          line.push(0);
          continue;
        }
        const id = token === -1 ? wood2.find((id2) => (available[id2] ?? 0) > 0) ?? (creative ? 8 : 0) : token;
        if (!id || !creative && !(available[id] > 0)) return false;
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
  restore(data) {
    const valid = (s) => s && Number.isInteger(s.id) && s.id > 0 && (BLOCKS[s.id] || ITEMS.some((i) => i.id === s.id)) && Number.isFinite(s.n) && s.n > 0 ? { id: s.id, n: Math.min(maxStack(s.id), Math.floor(s.n)) } : null;
    this.reset();
    this.slots = this.slots.map((_, i) => valid(data.slots?.[i]));
    this.grid = this.grid.map((_, i) => valid(data.grid?.[i]));
    this.cursor = valid(data.cursor);
    this.size = data.size === 3 ? 3 : 2;
  }
};

// lib/chest-slots.ts
var blankChest = () => Array.from({ length: 27 }, () => null);
function fromCounts(counts) {
  const slots = blankChest();
  let i = 0;
  for (const [key, n] of Object.entries(counts)) {
    const id = Number(key);
    let left = n;
    while (left > 0 && i < 27) {
      const amount = Math.min(maxStack(id), left);
      slots[i++] = { id, n: amount };
      left -= amount;
    }
  }
  return slots;
}
function chestCounts(slots) {
  const counts = {};
  for (const s of slots) if (s) counts[s.id] = (counts[s.id] ?? 0) + s.n;
  return counts;
}
function clickStack(slot, cursor, right = false) {
  let a = slot ? { ...slot } : null, b2 = cursor ? { ...cursor } : null;
  if (!b2 && a) {
    const take = right ? Math.ceil(a.n / 2) : a.n;
    b2 = { id: a.id, n: take };
    a.n -= take;
    if (!a.n) a = null;
  } else if (b2 && !a) {
    const take = right ? 1 : b2.n;
    a = { id: b2.id, n: take };
    b2.n -= take;
    if (!b2.n) b2 = null;
  } else if (a && b2 && a.id === b2.id) {
    const take = Math.min(maxStack(a.id) - a.n, right ? 1 : b2.n);
    a.n += take;
    b2.n -= take;
    if (!b2.n) b2 = null;
  } else if (a && b2 && !right) [a, b2] = [b2, a];
  return { slot: a, cursor: b2 };
}

// lib/inventory-gestures.ts
function validGesture(value) {
  if (!value || typeof value !== "object") return false;
  const g = value;
  const ref = (v) => !!v && ["slots", "grid", "chest"].includes(v.area) && Number.isInteger(v.index) && v.index >= 0 && v.index < (v.area === "slots" ? 36 : v.area === "grid" ? 9 : 27);
  if (g.type === "collect") return Number.isInteger(g.id) && g.id > 0 && g.id <= 130;
  if (g.type === "click")
    return ref(g.slot) && (g.right === void 0 || typeof g.right === "boolean") && (g.quick === void 0 || typeof g.quick === "boolean");
  return g.type === "move" && ref(g.from) && ref(g.to) && (g.expected == null || Number.isInteger(g.expected.id) && Number.isInteger(g.expected.n) && g.expected.n > 0);
}
function applyInventoryGesture(pack, gesture, chest) {
  if (!validGesture(gesture)) return false;
  const cells = (ref) => ref.area === "chest" ? chest : ref.area === "grid" && ref.index >= pack.size * pack.size ? void 0 : pack[ref.area];
  const click = (ref, right = false) => {
    const list2 = cells(ref);
    const result = clickStack(list2[ref.index], pack.cursor, right);
    list2[ref.index] = result.slot;
    pack.cursor = result.cursor;
  };
  if (gesture.type === "collect") {
    if (pack.cursor && pack.cursor.id !== gesture.id) return false;
    let amount = pack.cursor?.n ?? 0;
    const lists = [...chest ? [chest] : [], pack.slots, pack.grid];
    for (const full of [false, true])
      for (const list2 of lists)
        for (let i = 0; i < list2.length; i++) {
          if (list2 === pack.grid && i >= pack.size * pack.size) continue;
          const stack2 = list2[i];
          if (!stack2 || stack2.id !== gesture.id || stack2.n === maxStack(stack2.id) !== full)
            continue;
          const take = Math.min(stack2.n, maxStack(stack2.id) - amount);
          amount += take;
          stack2.n -= take;
          if (!stack2.n) list2[i] = null;
        }
    pack.cursor = amount ? { id: gesture.id, n: amount } : null;
    return true;
  }
  if (gesture.type === "move") {
    const from = cells(gesture.from), to = cells(gesture.to);
    if (!from || !to) return false;
    const source = from[gesture.from.index];
    if (Object.hasOwn(gesture, "expected") && (source?.id !== gesture.expected?.id || source?.n !== gesture.expected?.n))
      return false;
    if (pack.cursor) {
      click(gesture.to);
      return true;
    }
    if (gesture.from.area === gesture.to.area && gesture.from.index === gesture.to.index)
      return true;
    if (!source) return false;
    click(gesture.from);
    click(gesture.to);
    if (pack.cursor) click(gesture.from);
    return true;
  }
  const list = cells(gesture.slot);
  if (!list) return false;
  const stack = list[gesture.slot.index];
  if (gesture.quick && stack) {
    if (chest && gesture.slot.area !== "grid") {
      if (gesture.slot.area === "chest") {
        stack.n = pack.insert(stack.id, stack.n);
      } else {
        for (const empty of [false, true])
          for (let i = 0; i < chest.length && stack.n; i++) {
            const target = chest[i];
            if (empty ? !!target : target?.id !== stack.id) continue;
            const n = Math.min(stack.n, maxStack(stack.id) - (target?.n ?? 0));
            if (n) chest[i] = { id: stack.id, n: (target?.n ?? 0) + n };
            stack.n -= n;
          }
      }
      if (!stack.n) list[gesture.slot.index] = null;
    } else
      pack.click(gesture.slot.area, gesture.slot.index, !!gesture.right, true);
  } else click(gesture.slot, !!gesture.right);
  return true;
}

// lib/biomes.ts
var BIOMES = [
  {
    id: "plains",
    name: "Zielona dolina",
    color: "#a4c37c",
    description: "\u0141agodne wzg\xF3rza, spokojna rzeka i wioska, od kt\xF3rej zaczyna si\u0119 Twoja historia.",
    resources: "D\u0105b, kamie\u0144, pszenica",
    landmark: "Wioska i ruiny stra\u017Cnicy",
    surface: 1,
    base: 13,
    amplitude: 8,
    trunk: 5,
    leaves: 6,
    trees: 0.025,
    flower: 79,
    mob: "sheep"
  },
  {
    id: "forest",
    name: "D\u0119bowa puszcza",
    color: "#6e965e",
    description: "G\u0119ste korony drzew skrywaj\u0105 \u015Bcie\u017Cki i omsza\u0142e pozosta\u0142o\u015Bci dawnych budowli.",
    resources: "D\u0105b, mech, grzyby",
    landmark: "Omsza\u0142a stra\u017Cnica",
    surface: 1,
    base: 14,
    amplitude: 11,
    trunk: 5,
    leaves: 6,
    trees: 0.1,
    flower: 79,
    mob: "fox"
  },
  {
    id: "birch",
    name: "Brzozowy zagajnik",
    color: "#c5d6a2",
    description: "Jasne pnie, delikatne \u015Bwiat\u0142o i przestrze\u0144 na w\u0142asny dom.",
    resources: "Brzoza, kwiaty",
    landmark: "Le\u015Bna chatka",
    surface: 1,
    base: 15,
    amplitude: 9,
    trunk: 43,
    leaves: 6,
    trees: 0.07,
    flower: 69,
    mob: "bee"
  },
  {
    id: "cherry",
    name: "Wi\u015Bniowe wzg\xF3rza",
    color: "#edb4cb",
    description: "R\xF3\u017Cowe korony nad zboczami i p\u0142atki niesione przez wiatr.",
    resources: "Wi\u015Bnia, r\xF3\u017Cowe deski, p\u0142atki",
    landmark: "Pawilon w\u015Br\xF3d wi\u015Bni",
    surface: 1,
    base: 18,
    amplitude: 13,
    trunk: 49,
    leaves: 50,
    trees: 0.095,
    flower: 67,
    mob: "bee"
  },
  {
    id: "taiga",
    name: "Las \u015Bwierkowy",
    color: "#749893",
    description: "Wysokie \u015Bwierki, ch\u0142odne doliny i lisy na skraju lasu.",
    resources: "\u015Awierk, kamie\u0144, w\u0119giel",
    landmark: "Le\u015Bna chatka",
    surface: 1,
    base: 17,
    amplitude: 13,
    trunk: 25,
    leaves: 26,
    trees: 0.08,
    flower: 79,
    mob: "fox"
  },
  {
    id: "snow",
    name: "\u015Anie\u017Cne szczyty",
    color: "#d5edf2",
    description: "O\u015Bnie\u017Cone grzbiety, lodowe iglice i dalekie, czyste horyzonty.",
    resources: "\u015Anieg, l\xF3d, \u017Celazo",
    landmark: "Zamarzni\u0119ta stra\u017Cnica",
    surface: 19,
    base: 25,
    amplitude: 29,
    trunk: 25,
    leaves: 26,
    trees: 0.02,
    flower: 0,
    mob: "sheep"
  },
  {
    id: "desert",
    name: "Z\u0142ote wydmy",
    color: "#e8cd8b",
    description: "Faluj\u0105cy piasek, samotne kaktusy i skarb we wn\u0119trzu \u015Bwi\u0105tyni.",
    resources: "Piasek, piaskowiec, kaktus",
    landmark: "Pustynna piramida",
    surface: 4,
    base: 11,
    amplitude: 15,
    trunk: 0,
    leaves: 0,
    trees: 0.04,
    flower: 0,
    mob: "pig"
  },
  {
    id: "badlands",
    name: "Szkar\u0142atne kaniony",
    color: "#d88a59",
    description: "Tarasy terakoty, czerwony piasek i ostre zbocza nad w\u0105wozami.",
    resources: "Terakota, czerwony piasek, mied\u017A",
    landmark: "Opuszczona kopalnia",
    surface: 55,
    base: 16,
    amplitude: 27,
    trunk: 0,
    leaves: 0,
    trees: 0.015,
    flower: 0,
    mob: "fox"
  },
  {
    id: "jungle",
    name: "Bambusowa d\u017Cungla",
    color: "#76a961",
    description: "Wysokie drzewa, bambus i bujna ziele\u0144 otaczaj\u0105 zapomnian\u0105 \u015Bwi\u0105tyni\u0119.",
    resources: "Drewno d\u017Cunglowe, bambus, mech",
    landmark: "Le\u015Bna \u015Bwi\u0105tynia",
    surface: 1,
    base: 14,
    amplitude: 18,
    trunk: 76,
    leaves: 77,
    trees: 0.12,
    flower: 59,
    mob: "pig"
  },
  {
    id: "swamp",
    name: "Lasy namorzynowe",
    color: "#8ca58b",
    description: "Korzenie wyrastaj\u0105 z p\u0142ytkiej wody, a wieczorem pojawiaj\u0105 si\u0119 \u015Bwietliki.",
    resources: "Namorzyn, b\u0142oto, glina",
    landmark: "Chatka na palach",
    surface: 54,
    base: 10,
    amplitude: 4,
    trunk: 52,
    leaves: 53,
    trees: 0.08,
    flower: 79,
    mob: "frog"
  },
  {
    id: "mushroom",
    name: "Grzybowa dolina",
    color: "#bd9ed3",
    description: "Wielkie kapelusze i \u015Bwietliste grzyby tworz\u0105 niecodzienny krajobraz.",
    resources: "Grzyby, mech, jasnog\u0142az",
    landmark: "Kr\u0105g pradawnych run",
    surface: 71,
    base: 14,
    amplitude: 9,
    trunk: 24,
    leaves: 23,
    trees: 0.08,
    flower: 72,
    mob: "cow"
  },
  {
    id: "flower",
    name: "Kwiecista \u0142\u0105ka",
    color: "#d4cf81",
    description: "Kolorowe kwiaty i brz\u0119czenie pszcz\xF3\u0142 na otwartych, s\u0142onecznych pag\xF3rkach.",
    resources: "Kwiaty, nasiona, brzoza",
    landmark: "Wie\u017Ca widokowa",
    surface: 1,
    base: 14,
    amplitude: 10,
    trunk: 43,
    leaves: 6,
    trees: 0.025,
    flower: 70,
    mob: "bee"
  },
  {
    id: "crystal",
    name: "Kryszta\u0142owa kotlina",
    color: "#aa96dc",
    description: "Ametystowe skupiska b\u0142yszcz\u0105 po\u015Br\xF3d mchu i kamiennych \u0142uk\xF3w.",
    resources: "Ametyst, mech, g\u0142\u0119boka ska\u0142a",
    landmark: "Kryszta\u0142owe sanktuarium",
    surface: 71,
    base: 17,
    amplitude: 15,
    trunk: 43,
    leaves: 50,
    trees: 0.018,
    flower: 73,
    mob: "sheep"
  },
  {
    id: "ocean",
    name: "Rafowe wybrze\u017Ce",
    color: "#78c6d0",
    description: "P\u0142ytka turkusowa woda, koralowce i piaszczyste brzegi pod latarni\u0105.",
    resources: "Koral, piasek, woda",
    landmark: "Nadmorska latarnia",
    surface: 4,
    base: 5,
    amplitude: 7,
    trunk: 0,
    leaves: 0,
    trees: 0,
    flower: 74,
    mob: "frog"
  }
];
var BIOME_REGION = 96;
function hash(x, z, seed) {
  let n = Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed, 144269);
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967295;
}
var intro = {
  "0,0": "plains",
  "1,0": "cherry",
  "-1,0": "badlands",
  "0,1": "swamp",
  "0,-1": "snow",
  "1,1": "jungle",
  "-1,-1": "desert",
  "1,-1": "flower",
  "-1,1": "mushroom",
  "2,0": "birch",
  "-2,0": "crystal",
  "0,2": "ocean",
  "0,-2": "taiga",
  "2,1": "forest"
};
function region(cx, cz, seed) {
  const x = Math.round(cx * BIOME_REGION + (hash(cx, cz, seed) - 0.5) * 28), z = Math.round(cz * BIOME_REGION + (hash(cx, cz, seed + 13) - 0.5) * 28);
  const id = intro[cx + "," + cz];
  const biome = id ? BIOMES.find((b2) => b2.id === id) : BIOMES[Math.floor(hash(cx, cz, seed + 37) * BIOMES.length) % BIOMES.length];
  return { x, z, biome };
}
function biomeSample(x, z, seed) {
  const cx = Math.round(x / BIOME_REGION), cz = Math.round(z / BIOME_REGION);
  let first = Infinity, second = Infinity, chosen = BIOMES[0];
  for (let dx = -1; dx <= 1; dx++)
    for (let dz = -1; dz <= 1; dz++) {
      const r = region(cx + dx, cz + dz, seed), d = Math.hypot(x - r.x, z - r.z);
      if (d < first) {
        second = first;
        first = d;
        chosen = r.biome;
      } else if (d < second) second = d;
    }
  return {
    biome: chosen,
    blend: Math.max(0, Math.min(1, (second - first) / 26))
  };
}

// lib/world.ts
var SIZE = 16;
var HEIGHT = 72;
var WATER = 12;
function hash2(x, z, seed = 42) {
  let n = Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed, 144269);
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967295;
}
var smooth = (a) => a * a * (3 - 2 * a);
function noise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = smooth(x - ix), fz = smooth(z - iz);
  return (hash2(ix, iz, seed) * (1 - fx) + hash2(ix + 1, iz, seed) * fx) * (1 - fz) + (hash2(ix, iz + 1, seed) * (1 - fx) + hash2(ix + 1, iz + 1, seed) * fx) * fz;
}
var World = class {
  chunks = /* @__PURE__ */ new Map();
  edits = {};
  waterLevels = {};
  onEdit;
  dimension = "overworld";
  seed = 24680;
  constructor(seed = 24680) {
    this.seed = seed;
  }
  biomeInfo(x, z) {
    return biomeSample(x, z, this.seed).biome;
  }
  biome(x, z) {
    if (this.dimension === "nether") return "Pustkowia Netheru";
    if (this.dimension === "end") return "Wyspy Endu";
    return this.biomeInfo(x, z).name;
  }
  caveType(x, z) {
    const n = noise(x / 47, z / 47, this.seed + 71);
    return n < 0.34 ? "Kryszta\u0142owe groty" : n > 0.62 ? "Bujne jaskinie" : "Jaskinie naciekowe";
  }
  biomeAt(x, y, z) {
    return this.dimension === "overworld" && y < this.height(x, z) - 5 ? this.caveType(x, z) : this.biome(x, z);
  }
  height(x, z) {
    if (this.dimension === "end") {
      const d = Math.hypot(x, z);
      return d < 51 ? Math.round(16 + noise(x / 18, z / 18, this.seed) * 4 - Math.max(0, d - 34) * 0.55) : d > 66 && noise(x / 22, z / 22, this.seed) > 0.64 ? 14 : 0;
    }
    if (this.dimension === "nether")
      return Math.round(
        10 + noise(x / 23, z / 23, this.seed) * 11 + noise(x / 7, z / 7, this.seed + 4) * 3
      );
    const broad = noise(x / 52, z / 52, this.seed), detail = noise(x / 12, z / 12, this.seed + 12), sample = biomeSample(x, z, this.seed), biome = sample.biome;
    let special = biome.base + broad * biome.amplitude + detail * 3;
    if (biome.id === "desert") special += Math.sin(x * 0.13 + z * 0.035) * 2;
    if (biome.id === "badlands") special = Math.floor(special / 3) * 3;
    if (biome.id === "snow") special += Math.max(0, broad - 0.5) * 20;
    let h = (14 + broad * 8) * (1 - sample.blend) + special * sample.blend;
    const river = Math.abs(Math.sin(x * 0.022 + Math.sin(z * 0.022) * 1.4));
    if (river < 0.14 && Math.hypot(x, z) > 30 && biome.id !== "snow")
      h = Math.min(h, 9 + river / 0.14 * 6);
    if (Math.abs(x) < 26 && Math.abs(z) < 26) h = 15 + detail * 2;
    return Math.max(4, Math.min(58, Math.floor(h)));
  }
  chunk(cx, cz) {
    const k = cx + "," + cz;
    let c = this.chunks.get(k);
    if (!c) {
      c = { cx, cz, data: new Uint8Array(SIZE * SIZE * HEIGHT), dirty: true };
      this.chunks.set(k, c);
      this.generate(c);
    }
    return c;
  }
  raw(c, x, y, z, id) {
    if (x >= 0 && x < 16 && z >= 0 && z < 16 && y >= 0 && y < HEIGHT)
      c.data[x + z * 16 + y * 256] = id;
  }
  generate(c) {
    const ox = c.cx * 16, oz = c.cz * 16;
    for (let x = 0; x < 16; x++)
      for (let z = 0; z < 16; z++) {
        const wx = ox + x, wz = oz + z, h = this.height(wx, wz), biome = this.biomeInfo(wx, wz);
        for (let y = 0; y <= Math.max(h, this.dimension === "overworld" ? WATER : 8); y++) {
          let id = 0;
          if (y === 0) id = 35;
          else if (y > h)
            id = this.dimension === "overworld" ? 7 : this.dimension === "nether" ? 15 : 0;
          else if (this.dimension === "end") id = 17;
          else if (this.dimension === "nether")
            id = y === h && hash2(wx, wz, this.seed) > 0.91 ? 15 : 14;
          else if (y === h) id = h < WATER && biome.id !== "swamp" ? 4 : biome.surface;
          else if (y > h - 4)
            id = biome.id === "desert" ? 4 : biome.id === "badlands" ? [56, 57, 58][y % 3] : biome.id === "swamp" ? 54 : 2;
          else {
            const r = hash2(wx + y * 57, wz - y * 91, this.seed);
            id = y < 5 ? 82 : biome.id === "badlands" && y > 10 ? [56, 56, 57, 58, 56][y % 5] : 3;
            if (r > 0.97) id = 20;
            else if (r > 0.947) id = 21;
            else if (r > 0.937) id = 80;
            else if (r > 0.929 && y < 11) id = 22;
            if (y > 2 && y < h - 4 && noise(wx / 10 + y * 0.14, wz / 10 - y * 0.14, this.seed + 3) > 0.69)
              id = 0;
          }
          if (this.dimension === "overworld" && id === 2 && h <= 14 && hash2(wx + y, wz, this.seed + 94) > 0.55)
            id = 42;
          this.raw(c, x, y, z, id);
        }
        if (this.dimension === "nether" && hash2(wx, wz, this.seed) > 0.986) {
          for (let y = h + 1; y < h + 6; y++) this.raw(c, x, y, z, 35);
          this.raw(c, x, h + 6, z, 16);
        }
        if (this.dimension === "overworld") {
          const random = hash2(wx, wz, this.seed + 18);
          if (biome.id === "snow" && random > 0.995) {
            for (let y = h + 1; y < h + 9; y++) this.raw(c, x, y, z, 60);
          }
          if (h < WATER - 1 && biome.id === "ocean" && random > 0.88) this.raw(c, x, h + 1, z, 74);
          if (h >= WATER && Math.hypot(wx, wz) > 27 && biome.flower && random > 0.88) {
            const flower = biome.id === "flower" ? [67, 68, 69, 70][Math.floor(hash2(wx, wz, 17) * 4) % 4] : biome.flower;
            this.raw(c, x, h + 1, z, flower);
            if (flower === 59) for (let y = h + 2; y < h + 5; y++) this.raw(c, x, y, z, 59);
          }
          if ((h > WATER || biome.id === "swamp") && Math.hypot(wx, wz) > 28 && x > 2 && x < 13 && z > 2 && z < 13 && hash2(wx, wz, this.seed) > 1 - biome.trees) {
            if (!biome.trunk) {
              for (let y = 1; y < 4; y++) this.raw(c, x, h + y, z, 41);
            } else {
              const th = biome.id === "jungle" ? 9 : biome.id === "taiga" ? 8 : biome.id === "swamp" ? 7 : 5;
              for (let y = 1; y <= th; y++) this.raw(c, x, h + y, z, biome.trunk);
              if (biome.id === "swamp")
                for (const [dx, dz] of [
                  [1, 0],
                  [-1, 0],
                  [0, 1],
                  [0, -1]
                ])
                  for (let y = 0; y < 3; y++) this.raw(c, x + dx, h + y, z + dz, 52);
              for (let y = th - 2; y <= th + 1; y++) {
                const rad = y === th + 1 ? 1 : 2;
                for (let dx = -rad; dx <= rad; dx++)
                  for (let dz = -rad; dz <= rad; dz++)
                    if (Math.abs(dx) + Math.abs(dz) < rad * 2 + 1 && (dx || dz || y > th))
                      this.raw(c, x + dx, h + y, z + dz, biome.leaves);
              }
              if (biome.id === "cherry") {
                for (let dx = -2; dx <= 2; dx++) this.raw(c, x + dx, h + th - 2, z, 50);
              }
            }
          }
          for (let y = 3; y < h - 4; y++) {
            const index = x + z * 16 + y * 256;
            if (c.data[index] !== 0) continue;
            const r = hash2(wx + y * 13, wz, this.seed + 65), kind = this.caveType(wx, wz);
            if (c.data[index - 256] && r > 0.94) {
              if (kind === "Bujne jaskinie") {
                c.data[index - 256] = 71;
                this.raw(c, x, y, z, 72);
              } else this.raw(c, x, y, z, kind === "Kryszta\u0142owe groty" ? 73 : 75);
            }
            if (c.data[index + 256] && r > 0.96)
              this.raw(
                c,
                x,
                y,
                z,
                kind === "Bujne jaskinie" ? 16 : kind === "Kryszta\u0142owe groty" ? 73 : 75
              );
          }
        }
      }
    this.structures(c);
    this.landmarks(c);
    const prefix = this.dimension + ":";
    for (const [key, id] of Object.entries(this.edits)) {
      if (!key.startsWith(prefix)) continue;
      const [x, y, z] = key.slice(prefix.length).split(",").map(Number);
      if (Math.floor(x / 16) === c.cx && Math.floor(z / 16) === c.cz)
        this.raw(c, x - ox, y, z - oz, id);
    }
  }
  landmarks(c) {
    if (this.dimension !== "overworld") return;
    const put = (x, y, z, id) => this.raw(c, x - c.cx * 16, y, z - c.cz * 16, id), box = (x, y, z, w, h, d, id) => {
      for (let a = 0; a < w; a++)
        for (let b2 = 0; b2 < h; b2++) for (let e = 0; e < d; e++) put(x + a, y + b2, z + e, id);
    };
    const rcx = Math.round(c.cx * 16 / 96), rcz = Math.round(c.cz * 16 / 96);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        const cx = rcx + dx, cz = rcz + dz;
        if (cx === 0 && cz === 0) continue;
        const r = region(cx, cz, this.seed), x = r.x, z = r.z, b2 = r.biome;
        if (x < c.cx * 16 - 16 || x > c.cx * 16 + 32 || z < c.cz * 16 - 16 || z > c.cz * 16 + 32)
          continue;
        const y = this.height(x, z) + 1;
        if (b2.id === "desert" || b2.id === "jungle") {
          const stone2 = b2.id === "desert" ? 27 : 40;
          for (let h = 0; h < 6; h++)
            box(x - 7 + h, y + h, z - 7 + h, 15 - h * 2, 1, 15 - h * 2, stone2);
          box(x - 3, y, z - 3, 7, 3, 7, 0);
          box(x - 1, y, z + 3, 3, 2, 5, 0);
          put(x, y, z, 61);
          for (const a of [-4, 4]) {
            box(x + a, y, z + 6, 1, 4, 1, 83);
            put(x + a, y + 4, z + 6, 48);
          }
          put(x, y + 4, z, 84);
        } else if (b2.id === "swamp" || b2.id === "birch" || b2.id === "taiga" || b2.id === "cherry") {
          const plank = b2.id === "swamp" ? 86 : b2.id === "cherry" ? 51 : 8, base = b2.id === "swamp" ? Math.max(16, y + 3) : y;
          for (const a of [-3, 3])
            for (const e of [-3, 3]) box(x + a, y - 3, z + e, 1, base - y + 7, 1, b2.trunk || 5);
          box(x - 3, base, z - 3, 7, 1, 7, plank);
          box(x - 3, base + 1, z - 3, 7, 3, 7, plank);
          box(x - 2, base + 1, z - 2, 5, 3, 5, 0);
          box(x, base + 1, z + 3, 1, 2, 1, 0);
          for (let a = 0; a < 3; a++) box(x - 4 + a, base + 4 + a, z - 4, 9 - a * 2, 1, 9, 47);
          put(x - 2, base + 1, z - 2, 61);
          put(x + 1, base + 1, z - 2, 62);
          put(x, base + 3, z, 48);
          for (let i = 0; i < 5; i++) box(x - 1, base - i, z + 4 + i, 3, 1, 1, 9);
        } else if (b2.id === "mushroom" || b2.id === "crystal") {
          for (let i = 0; i < 8; i++) {
            const a = i / 8 * Math.PI * 2, px = x + Math.round(Math.cos(a) * 5), pz = z + Math.round(Math.sin(a) * 5);
            box(px, y, pz, 1, 3 + i % 3, 1, b2.id === "crystal" ? 73 : 40);
            put(px, y + 3 + i % 3, pz, 84);
          }
          box(x - 2, y - 1, z - 2, 5, 1, 5, 82);
          put(x, y, z, 61);
          put(x, y + 1, z, 84);
        } else if (b2.id === "badlands") {
          box(x - 3, y - 3, z - 3, 7, 5, 9, 0);
          box(x - 4, y - 4, z - 4, 9, 1, 10, 8);
          for (const a of [-3, 3]) for (const e of [-3, 0, 3]) box(x + a, y - 3, z + e, 1, 5, 1, 5);
          for (const e of [-3, 0, 3]) box(x - 3, y + 1, z + e, 7, 1, 1, 5);
          put(x, y - 3, z - 2, 61);
          put(x + 2, y - 3, z - 2, 22);
          put(x - 2, y - 3, z - 2, 80);
          put(x, y + 1, z, 48);
        } else {
          const stone2 = b2.id === "ocean" ? 85 : b2.id === "snow" ? 60 : 40, base = b2.id === "ocean" ? 13 : y;
          box(x - 3, base - 1, z - 3, 7, 1, 7, 9);
          for (let h = 0; h < 11; h++)
            for (let a = -2; a <= 2; a++)
              for (let e = -2; e <= 2; e++)
                if (a === -2 || a === 2 || e === -2 || e === 2) put(x + a, base + h, z + e, stone2);
          box(x - 1, base, z + 2, 2, 3, 1, 0);
          box(x - 3, base + 10, z - 3, 7, 1, 7, 8);
          box(x - 1, base + 11, z - 1, 3, 2, 3, 10);
          put(x, base + 12, z, 16);
          box(x - 2, base + 13, z - 2, 5, 1, 5, 47);
          put(x, base, z, 61);
        }
      }
  }
  ruinLocation() {
    const angle = hash2(this.seed, 9, 331) * Math.PI * 2, r = 210 + Math.floor(hash2(this.seed, 7, 813) * 110);
    const x = Math.round(Math.cos(angle) * r), z = Math.round(Math.sin(angle) * r);
    return { x, z, y: this.height(x, z) + 1 };
  }
  structures(c) {
    const put = (x, y, z, id) => this.raw(c, x - c.cx * 16, y, z - c.cz * 16, id);
    const box = (x, y, z, w, h, d, id) => {
      for (let a = 0; a < w; a++)
        for (let b2 = 0; b2 < h; b2++) for (let e = 0; e < d; e++) put(x + a, y + b2, z + e, id);
    };
    if (this.dimension === "overworld") {
      for (const [hx, hz] of [
        [-7, -2],
        [7, -8],
        [-10, -17]
      ]) {
        const y = this.height(hx, hz);
        box(hx - 1, y - 2, hz - 1, 9, 3, 9, 9);
        box(hx, y + 1, hz, 7, 4, 7, 8);
        box(hx + 1, y + 1, hz + 1, 5, 3, 5, 0);
        box(hx + 3, y + 1, hz + 6, 1, 2, 1, 0);
        for (const z of [hz + 2, hz + 4]) {
          put(hx, y + 2, z, 10);
          put(hx + 6, y + 2, z, 10);
        }
        for (let a = 0; a < 4; a++) box(hx - 1 + a, y + 5 + a, hz - 1, 9 - a * 2, 1, 9, 47);
        put(hx + 1, y + 1, hz + 1, 28);
        put(hx + 2, y + 1, hz + 1, 29);
        put(hx + 4, y + 1, hz + 1, 30);
        put(hx + 3, y + 3, hz + 3, 48);
        put(hx + 1, y + 1, hz + 4, 61);
        put(hx + 4, y + 1, hz + 2, 62);
      }
      const wellY = this.height(4, 4);
      box(2, wellY, 2, 5, 1, 5, 40);
      box(3, wellY, 3, 3, 1, 3, 7);
      for (const x of [2, 6]) for (const z of [2, 6]) box(x, wellY + 1, z, 1, 3, 1, 5);
      box(1, wellY + 4, 1, 7, 1, 7, 8);
      const fy = this.height(13, 4);
      for (let x = 10; x <= 17; x++)
        for (let z = 1; z <= 7; z++) {
          put(x, fy, z, x === 13 ? 7 : 63);
          if (x !== 13) put(x, fy + 1, z, 66);
        }
      const ruin = this.ruinLocation();
      if (Math.abs(c.cx * 16 - ruin.x) < 32 && Math.abs(c.cz * 16 - ruin.z) < 32) {
        box(ruin.x - 2, ruin.y - 1, ruin.z - 2, 8, 1, 6, 40);
        for (let a = 0; a < 4; a++)
          for (let b2 = 0; b2 < 5; b2++)
            if (a === 0 || a === 3 || b2 === 0 || b2 === 4) {
              if (!(a === 0 && b2 === 2 || a === 3 && b2 === 3 || a === 1 && b2 === 4))
                put(ruin.x + a, ruin.y + b2, ruin.z, 12);
            } else put(ruin.x + a, ruin.y + b2, ruin.z, 0);
        put(ruin.x - 1, ruin.y, ruin.z + 2, 61);
        put(ruin.x + 5, ruin.y, ruin.z, 14);
        put(ruin.x + 4, ruin.y, ruin.z + 1, 12);
      }
      this.portal(put, 20, -15, 18);
      const tx = 34, tz = -33, ty = this.height(tx, tz);
      for (let h = 0; h < 12; h++)
        for (let x = 0; x < 6; x++)
          for (let z = 0; z < 6; z++)
            if (x === 0 || z === 0 || x === 5 || z === 5) {
              if (h < 8 || hash2(x + h, z, 4) > 0.35) put(tx + x, ty + h, tz + z, 40);
            }
      box(tx + 2, ty + 1, tz + 5, 2, 3, 1, 0);
      put(tx + 2, ty + 1, tz + 2, 61);
    } else if (this.dimension === "nether") {
      this.portal(put, 0, 5, 13);
      const y = 25;
      box(-16, y, -20, 32, 2, 7, 38);
      for (const x of [-16, -8, 0, 8, 15]) {
        box(x, 8, -20, 2, 17, 2, 38);
        box(x, y + 2, -20, 1, 2, 1, 38);
        put(x, y + 3, -19, 16);
      }
      for (const x of [-16, 10]) {
        box(x, y, -27, 6, 10, 6, 38);
        box(x + 1, y + 2, -26, 4, 6, 4, 0);
        box(x + 2, y + 2, -22, 2, 3, 2, 0);
      }
      put(-14, 27, -25, 61);
      put(12, 27, -25, 61);
      this.portal(put, 17, 6, 18);
    } else {
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2, x = Math.round(Math.cos(a) * 29), z = Math.round(Math.sin(a) * 29), h = 13 + i % 3 * 4;
        box(x - 1, 17, z - 1, 3, h, 3, 12);
      }
      box(-3, 18, -3, 7, 1, 7, 35);
      for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) put(x, 19, z, 18);
    }
  }
  portal(put, x, z, id) {
    const y = this.height(x, z) + 1;
    for (let a = -2; a <= 2; a++)
      for (let b2 = 0; b2 < 6; b2++)
        put(x + a, y + b2, z, a === -2 || a === 2 || b2 === 0 || b2 === 5 ? 12 : id);
    for (let a = -3; a <= 3; a++) for (let b2 = -2; b2 <= 2; b2++) put(x + a, y - 1, z + b2, 9);
  }
  get(x, y, z) {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    if (y < 0) return 35;
    if (y >= HEIGHT) return 0;
    const c = this.chunks.get(Math.floor(x / 16) + "," + Math.floor(z / 16));
    if (!c) return 0;
    return c.data[(x % 16 + 16) % 16 + (z % 16 + 16) % 16 * 16 + y * 256];
  }
  set(x, y, z, id, flow = false) {
    if (y <= 0 || y >= HEIGHT) return;
    const c = this.chunk(Math.floor(x / 16), Math.floor(z / 16));
    this.raw(c, (x % 16 + 16) % 16, y, (z % 16 + 16) % 16, id);
    this.edits[this.dimension + ":" + x + "," + y + "," + z] = id;
    if (!flow) delete this.waterLevels[this.dimension + ":" + x + "," + y + "," + z];
    this.onEdit?.(x, y, z);
    c.dirty = true;
    for (const [dx, dz] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1]
    ]) {
      const n = this.chunks.get(c.cx + dx + "," + (c.cz + dz));
      if (n) n.dirty = true;
    }
  }
  waterAt(x, y, z) {
    if (this.get(x, y, z) !== 7) return false;
    const iy = Math.floor(y), key = this.dimension + ":" + Math.floor(x) + "," + iy + "," + Math.floor(z), level = this.waterLevels[key] ?? 0;
    const height = this.get(x, iy + 1, z) === 7 || level === 8 ? 1 : 0.88 - level * 0.095;
    return y - iy < height;
  }
  solid(x, y, z) {
    return !!BLOCKS[this.get(x, y, z)]?.solid;
  }
  surface(x, z) {
    this.chunk(Math.floor(x / 16), Math.floor(z / 16));
    for (let y = HEIGHT - 2; y >= 0; y--) if (this.solid(x, y, z)) return y + 1;
    return 1;
  }
  switch(d) {
    this.dimension = d;
    this.chunks.clear();
  }
};

// lib/fluid.ts
var FluidSystem = class {
  constructor(world) {
    this.world = world;
    world.onEdit = (x, y, z) => this.wake(x, y, z);
  }
  world;
  queue = /* @__PURE__ */ new Set();
  timer = 0;
  key(x, y, z) {
    return this.world.dimension + ":" + x + "," + y + "," + z;
  }
  level(x, y, z) {
    return this.world.get(x, y, z) === 7 ? this.world.waterLevels[this.key(x, y, z)] ?? 0 : -1;
  }
  wake(x, y, z) {
    for (const [dx, dy, dz] of [
      [0, 0, 0],
      [1, 0, 0],
      [-1, 0, 0],
      [0, 0, 1],
      [0, 0, -1],
      [0, 1, 0],
      [0, -1, 0]
    ])
      if (y + dy > 0 && y + dy < 71) this.queue.add([x + dx, y + dy, z + dz].join(","));
  }
  clear() {
    this.queue.clear();
  }
  tick(dt) {
    this.timer += dt;
    if (this.timer < 0.12) return;
    this.timer = 0;
    this.step();
  }
  step(limit = 700) {
    const cells = Array.from(this.queue).slice(0, limit);
    for (const key of cells) {
      this.queue.delete(key);
      const [x, y, z] = key.split(",").map(Number);
      this.update(x, y, z);
    }
  }
  update(x, y, z) {
    const w = this.world, id = w.get(x, y, z), level = this.level(x, y, z);
    if (id !== 0 && id !== 7 && id !== 15 && !BLOCKS[id]?.plant) return;
    if (id === 7) {
      for (const [dx, dy, dz] of [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 0, 1],
        [0, 0, -1],
        [0, -1, 0]
      ])
        if (w.get(x + dx, y + dy, z + dz) === 15) w.set(x + dx, y + dy, z + dz, 12);
      if (level === 0) return;
    }
    let desired = -1;
    if (this.level(x, y + 1, z) >= 0) desired = 8;
    else {
      let sources = 0;
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ]) {
        const n = this.level(x + dx, y, z + dz);
        if (n === 0) sources++;
        if (n < 0 || n === 7) continue;
        const supported = w.solid(x + dx, y - 1, z + dz) || this.level(x + dx, y - 1, z + dz) === 0;
        if (!supported) continue;
        const candidate = n === 8 ? 1 : n + 1;
        if (candidate <= 7 && (desired < 0 || candidate < desired)) desired = candidate;
      }
      if (sources >= 2 && w.solid(x, y - 1, z)) desired = 0;
    }
    if (id === 15) {
      if (desired >= 0) w.set(x, y, z, 3);
      return;
    }
    if (level === desired) return;
    const stateKey = this.key(x, y, z);
    if (desired >= 0) {
      w.waterLevels[stateKey] = desired;
      w.set(x, y, z, 7, true);
    } else {
      delete w.waterLevels[stateKey];
      if (id === 7) w.set(x, y, z, 0, true);
    }
    this.wake(x, y, z);
  }
};

// lib/entities.ts
import * as THREE from "three";
var cubeGeo = new THREE.BoxGeometry(1, 1, 1);
var materialCache = /* @__PURE__ */ new Map();
function mat(color, glow = false) {
  const key = color + glow;
  let m = materialCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.85,
      emissive: glow ? color : "#000000",
      emissiveIntensity: glow ? 1 : 0
    });
    materialCache.set(key, m);
  }
  return m;
}
function cube(parent, color, x, y, z, w, h, d, glow = false) {
  const mesh = new THREE.Mesh(cubeGeo, mat(color, glow));
  mesh.position.set(x, y, z);
  mesh.scale.set(w, h, d);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
var Mob = class {
  constructor(kind, x, z, world) {
    this.kind = kind;
    this.hostile = [
      "zombie",
      "creeper",
      "skeleton",
      "enderman",
      "ghast",
      "piglin",
      "blaze",
      "slime"
    ].includes(kind);
    this.flying = ["ghast", "blaze", "bee"].includes(kind);
    this.hp = kind === "enderman" ? 40 : kind === "ghast" ? 30 : 20;
    this.speed = this.hostile ? 1.9 : 1;
    this.group.position.set(x, world.surface(x, z) + (this.flying ? 7 : 0), z);
    this.make();
    this.rig();
  }
  kind;
  group = new THREE.Group();
  legs = [];
  eyes = [];
  head = new THREE.Group();
  tails = [];
  wings = [];
  skinMaterials = [];
  baseScale = new THREE.Vector3(1, 1, 1);
  elapsed = Math.random() * 20;
  gait = 0;
  walkBlend = 0;
  deathTime = 0;
  attackClock = 0;
  rangedAttack = false;
  state = "idle";
  hp = 20;
  hostile = false;
  timer = Math.random() * 8;
  attackCooldown = 0;
  heading = Math.random() * 6.28;
  dead = false;
  hurt = 0;
  fuse = 0;
  size = 0.65;
  speed = 1.1;
  flying = false;
  make() {
    const k = this.kind, g = this.group;
    const eye = (x, y, z, color = "#202428") => {
      const m = cube(g, color, x, y, z, 0.085, 0.09, 0.018, k === "enderman");
      this.eyes.push(m);
      return m;
    };
    if (k === "bee") {
      cube(g, "#e8b647", 0, 0.45, 0, 0.65, 0.55, 0.9);
      for (const z of [-0.22, 0.14]) cube(g, "#574838", 0, 0.45, z, 0.67, 0.57, 0.16);
      cube(g, "#efc65c", 0, 0.5, -0.51, 0.62, 0.53, 0.28);
      eye(-0.2, 0.54, -0.66);
      eye(0.2, 0.54, -0.66);
      for (const side of [-1, 1]) {
        this.wings.push(cube(g, "#dff6f1", side * 0.48, 0.77, 0, 0.65, 0.045, 0.57));
        cube(g, "#493b2b", side * 0.16, 0.9, -0.51, 0.045, 0.36, 0.045);
        for (const z of [-0.23, 0.2])
          this.legs.push(cube(g, "#493b2b", side * 0.24, 0.08, z, 0.045, 0.28, 0.045));
      }
      this.size = 0.5;
      this.speed = 1.4;
    } else if (k === "frog") {
      cube(g, "#819b49", 0, 0.3, 0, 0.65, 0.42, 0.72);
      cube(g, "#a4b657", 0, 0.52, -0.3, 0.75, 0.38, 0.42);
      cube(g, "#d9d69c", 0, 0.35, -0.52, 0.56, 0.12, 0.02);
      for (const side of [-1, 1]) {
        cube(g, "#98ae54", side * 0.27, 0.78, -0.35, 0.24, 0.2, 0.25);
        eye(side * 0.27, 0.8, -0.482);
        for (const z of [-0.28, 0.3])
          this.legs.push(cube(g, "#738b3f", side * 0.38, 0.12, z, 0.28, 0.18, 0.38));
      }
      this.size = 0.5;
      this.speed = 0.8;
    } else if (k === "fox") {
      cube(g, "#c87537", 0, 0.65, 0, 0.62, 0.55, 1.05);
      cube(g, "#e48d42", 0, 0.82, -0.61, 0.56, 0.51, 0.51);
      cube(g, "#ead9ba", 0, 0.66, -0.91, 0.42, 0.19, 0.24);
      cube(g, "#433329", 0, 0.7, -1.05, 0.15, 0.12, 0.1);
      for (const side of [-1, 1]) {
        eye(side * 0.16, 0.88, -0.88);
        cube(g, "#da843d", side * 0.2, 1.2, -0.56, 0.18, 0.32, 0.2);
        cube(g, "#463426", side * 0.2, 1.34, -0.57, 0.15, 0.08, 0.16);
        for (const z of [-0.34, 0.35])
          this.legs.push(cube(g, "#574032", side * 0.21, 0.21, z, 0.14, 0.43, 0.18));
      }
      const tail = new THREE.Group();
      tail.position.set(0, 0.7, 0.44);
      g.add(tail);
      cube(tail, "#d28140", 0, 0, 0.43, 0.33, 0.34, 0.86);
      cube(tail, "#f0e4cc", 0, 0, 0.87, 0.32, 0.33, 0.25);
      this.tails.push(tail);
      this.speed = 1.5;
    } else if (["sheep", "pig", "cow", "chicken"].includes(k)) {
      const col = k === "sheep" ? "#e6e1d5" : k === "pig" ? "#e8a29b" : k === "cow" ? "#665243" : "#efead9";
      const small = k === "chicken" ? 0.55 : 1;
      cube(g, col, 0, 0.85, 0, 0.85, 0.7, 1.25);
      cube(g, k === "sheep" ? "#9e9180" : col, 0, 1.05, -0.73, 0.58, 0.55, 0.52);
      for (const x of [-0.27, 0.27])
        for (const z of [-0.42, 0.42])
          this.legs.push(
            cube(g, k === "pig" ? "#c48880" : "#837969", x, 0.28, z, 0.22, 0.56, 0.23)
          );
      eye(-0.16, 1.16, -1);
      eye(0.16, 1.16, -1);
      if (k === "pig") cube(g, "#c8797c", 0, 0.98, -1.03, 0.28, 0.19, 0.13);
      if (k === "cow") {
        cube(g, "#e8dfc9", 0.15, 0.98, -0.1, 0.59, 0.45, 0.7);
        cube(g, "#e8dfc9", -0.18, 0.96, 0.35, 0.46, 0.5, 0.3);
        for (const x of [-0.28, 0.28]) cube(g, "#c6bea4", x, 1.4, -0.71, 0.12, 0.25, 0.13);
      }
      if (k === "chicken") {
        cube(g, "#d5a846", 0, 1.01, -1.04, 0.24, 0.14, 0.21);
        cube(g, "#c84c41", 0, 0.81, -1, 0.13, 0.16, 0.1);
      }
      g.scale.setScalar(small);
    } else if (k === "ghast") {
      cube(g, "#d7d3d5", 0, 1, 0, 2.4, 2.4, 2.4);
      for (let x = -1; x <= 1; x++)
        for (let z = -1; z <= 1; z++)
          this.legs.push(cube(g, "#b9b0b9", x * 0.7, -0.8, z * 0.7, 0.3, 1.5, 0.3));
      cube(g, "#542f40", -0.58, 1.3, -1.22, 0.45, 0.17, 0.05);
      cube(g, "#542f40", 0.58, 1.3, -1.22, 0.45, 0.17, 0.05);
      cube(g, "#542f40", 0, 0.58, -1.22, 0.5, 0.5, 0.05);
      this.size = 1.8;
    } else if (k === "slime") {
      cube(g, "#80b76d", 0, 0.65, 0, 1.3, 1.3, 1.3);
      eye(-0.28, 0.86, -0.66);
      eye(0.28, 0.86, -0.66);
      cube(g, "#263c27", 0, 0.48, -0.66, 0.36, 0.12, 0.02);
    } else if (k === "blaze") {
      cube(g, "#dcb644", 0, 1.5, 0, 0.7, 0.6, 0.6, true);
      eye(-0.18, 1.65, -0.31);
      eye(0.18, 1.65, -0.31);
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2;
        this.legs.push(
          cube(
            g,
            "#e6ac3b",
            Math.cos(a) * 0.6,
            0.8 + i % 2 * 0.5,
            Math.sin(a) * 0.6,
            0.16,
            0.7,
            0.16,
            true
          )
        );
      }
    } else if (k === "creeper") {
      cube(g, "#759858", 0, 1.1, 0, 0.65, 1.1, 0.48);
      cube(g, "#769a59", 0, 1.87, 0, 0.75, 0.72, 0.65);
      for (const x of [-0.24, 0.24])
        for (const z of [-0.25, 0.25])
          this.legs.push(cube(g, "#668748", x, 0.28, z, 0.27, 0.55, 0.32));
      cube(g, "#273622", -0.18, 1.98, -0.331, 0.18, 0.2, 0.02);
      cube(g, "#273622", 0.18, 1.98, -0.331, 0.18, 0.2, 0.02);
      cube(g, "#273622", 0, 1.73, -0.331, 0.18, 0.3, 0.02);
      for (const x of [-0.13, 0.13]) cube(g, "#273622", x, 1.62, -0.331, 0.15, 0.2, 0.02);
    } else {
      const end = k === "enderman", skin = end ? "#25242f" : k === "zombie" ? "#698255" : k === "skeleton" ? "#cdc7b8" : "#b99a81", shirt = k === "zombie" ? "#538d95" : k === "piglin" ? "#805e43" : skin, legs = k === "zombie" ? "#615b8a" : skin;
      cube(g, shirt, 0, 1.23, 0, end ? 0.45 : 0.64, end ? 1 : 0.75, 0.34);
      cube(g, skin, 0, end ? 2.3 : 1.92, 0, 0.64, 0.64, 0.58);
      for (const x of [-0.18, 0.18])
        this.legs.push(
          cube(g, legs, x, end ? 0.64 : 0.45, 0, end ? 0.13 : 0.24, end ? 1.3 : 0.9, 0.25)
        );
      for (const x of [-0.47, 0.47]) {
        const arm = cube(
          g,
          skin,
          x,
          end ? 1.05 : 1.19,
          k === "zombie" ? -0.32 : 0,
          end ? 0.11 : 0.2,
          end ? 1.4 : 0.78,
          0.23
        );
        if (k === "zombie") arm.rotation.x = -1.35;
        this.legs.push(arm);
      }
      eye(-0.17, end ? 2.37 : 2, -0.3, end ? "#bf77ff" : "#292d26");
      eye(0.17, end ? 2.37 : 2, -0.3, end ? "#bf77ff" : "#292d26");
      if (k === "piglin") cube(g, "#d1b192", 0, 1.8, -0.36, 0.31, 0.2, 0.19);
      if (k === "skeleton") cube(g, "#6f5234", -0.6, 1.2, -0.25, 0.08, 0.8, 0.12);
    }
  }
  rig() {
    const g = this.group, k = this.kind;
    this.baseScale.copy(g.scale);
    const animal = ["sheep", "cow", "pig", "chicken", "fox"].includes(k);
    const humanoid = ["zombie", "skeleton", "piglin", "enderman", "creeper"].includes(k);
    if (animal || humanoid || k === "frog" || k === "bee") {
      this.head.position.set(
        0,
        animal ? 0.9 : k === "frog" ? 0.48 : k === "bee" ? 0.5 : k === "enderman" ? 2.12 : 1.65,
        animal ? -0.55 : k === "frog" ? -0.3 : k === "bee" ? -0.45 : 0
      );
      for (const o of g.children.slice()) {
        if (!(o instanceof THREE.Mesh) || this.legs.includes(o) || this.wings.includes(o)) continue;
        const isHead = animal ? o.position.z < -0.5 && o.position.y > 0.6 : k === "frog" ? o.position.y > 0.4 && o.position.z < -0.15 : k === "bee" ? o.position.z < -0.4 : o.position.y > (k === "enderman" ? 2 : 1.58);
        if (isHead) {
          o.position.sub(this.head.position);
          this.head.add(o);
        }
      }
      g.add(this.head);
    }
    if (animal && k !== "fox") {
      const tail = new THREE.Group();
      tail.position.set(0, 0.95, 0.62);
      g.add(tail);
      cube(tail, k === "pig" ? "#ce8c85" : "#9d9582", 0, -0.12, 0.1, 0.08, 0.3, 0.08);
      this.tails.push(tail);
    }
    if (k === "chicken")
      for (const side of [-1, 1])
        this.wings.push(cube(g, "#ded8c8", side * 0.5, 0.93, 0, 0.16, 0.45, 0.72));
    if (!["ghast", "blaze"].includes(k))
      this.legs = this.legs.map((l) => {
        const pivot = new THREE.Group();
        pivot.position.copy(l.position);
        pivot.position.y += l.scale.y * 0.45;
        l.position.sub(pivot.position);
        g.add(pivot);
        pivot.add(l);
        return pivot;
      });
    g.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const material = o.material.clone();
        o.material = material;
        this.skinMaterials.push({
          material,
          emissive: material.emissive.clone(),
          intensity: material.emissiveIntensity
        });
      }
    });
  }
  die() {
    if (this.dead) return;
    this.dead = true;
    this.deathTime = 0;
    this.state = "dead";
    this.attackClock = 0;
  }
  dispose() {
    for (const m of this.skinMaterials) m.material.dispose();
    this.skinMaterials = [];
  }
  update(dt, _t, player, world, damage, shoot, explode) {
    this.elapsed += dt;
    const t = this.elapsed, k = this.kind, pos = this.group.position;
    if (this.dead) {
      this.deathTime += dt;
      const p = Math.min(1, this.deathTime / 0.7);
      this.group.rotation.z = Math.sin(p * Math.PI / 2) * 1.45;
      this.group.position.y -= dt * 0.12;
      for (const m of this.skinMaterials) {
        m.material.transparent = true;
        m.material.opacity = Math.max(0, 1 - (this.deathTime - 0.6) / 0.65);
      }
      if (this.deathTime > 1.3) this.group.visible = false;
      return;
    }
    this.timer -= dt;
    this.attackCooldown -= dt;
    this.hurt = Math.max(0, this.hurt - dt);
    const dist = pos.distanceTo(player), alert = this.hostile && dist < 27, ranged = ["skeleton", "ghast", "blaze"].includes(k);
    if (alert) this.heading = Math.atan2(player.x - pos.x, player.z - pos.z);
    else if (this.timer <= 0) {
      this.heading += Math.random() * 2.5 - 1.25;
      this.timer = 2 + Math.random() * 5;
    }
    if (this.attackClock > 0) {
      const before = this.attackClock;
      this.attackClock -= dt;
      if (before > 0.34 && this.attackClock <= 0.34) {
        if (this.rangedAttack) {
          if (dist < 30) shoot(pos.clone().add(new THREE.Vector3(0, 1.5, 0)));
        } else if (dist < 2.65) damage(k === "enderman" ? 4 : 2);
      }
    } else if (alert && this.attackCooldown <= 0 && k !== "creeper" && (dist < 2.1 || ranged && dist > 4)) {
      this.rangedAttack = ranged && dist > 4;
      this.attackClock = 0.65;
      this.attackCooldown = this.rangedAttack ? 3 : 1.4;
    }
    if (k === "creeper") {
      this.fuse = Math.max(0, this.fuse + (dist < 2.4 ? dt : -dt * 0.7));
      if (this.fuse > 1.3) {
        explode(pos.clone());
        this.die();
        return;
      }
    }
    const graze = !this.hostile && !this.flying && Math.sin(t * 0.65) < -0.35;
    const walk = alert ? dist > (ranged ? 7 : 1.6) && this.attackClock <= 0.1 : !graze && Math.sin(t * 0.7) > -0.3;
    this.state = this.hurt > 0 ? "hurt" : this.attackClock > 0 ? "attack" : this.fuse > 0.1 ? "fuse" : walk ? "walk" : graze ? "graze" : "idle";
    const previous = pos.clone(), speed = this.speed * (this.hurt > 0 ? -2 : alert ? 1.25 : 1);
    if (walk || this.hurt > 0) {
      const nx = pos.x + Math.sin(this.heading) * speed * dt, nz = pos.z + Math.cos(this.heading) * speed * dt;
      if (this.flying) {
        pos.x = nx;
        pos.z = nz;
      } else {
        const floor = world.surface(nx, nz);
        if (floor - pos.y < 1.25 && floor > 1 && world.get(nx, floor, nz) !== 7 && world.get(nx, floor, nz) !== 15) {
          pos.x = nx;
          pos.z = nz;
          pos.y += (floor - pos.y) * Math.min(1, dt * 12);
        } else this.heading += dt * 4;
      }
    }
    const moving = Math.hypot(pos.x - previous.x, pos.z - previous.z) > 1e-4;
    this.walkBlend = THREE.MathUtils.lerp(this.walkBlend, moving ? 1 : 0, 1 - Math.exp(-dt * 9));
    this.gait += dt * (alert ? 10 : 7);
    const turn = THREE.MathUtils.euclideanModulo(
      this.heading + Math.PI - this.group.rotation.y + Math.PI,
      Math.PI * 2
    ) - Math.PI;
    this.group.rotation.y += turn * (1 - Math.exp(-dt * 7));
    this.group.rotation.z = this.flying ? THREE.MathUtils.clamp(-turn * 0.18, -0.35, 0.35) : Math.sin(this.gait) * 0.022 * this.walkBlend;
    this.group.scale.copy(this.baseScale);
    this.group.scale.y *= 1 + Math.sin(t * 2.6) * 0.012 + Math.sin(t * 23) * this.fuse * 0.075;
    if (this.flying) {
      const target = world.surface(pos.x, pos.z) + (k === "bee" ? 1.6 : 7) + Math.sin(t * (k === "bee" ? 3 : 1.5)) * 0.35;
      pos.y += (target - pos.y) * (1 - Math.exp(-dt * 2));
    }
    if (k === "slime" || k === "frog") {
      const hop = Math.max(0, Math.sin(this.gait * 0.48)), amount = this.walkBlend;
      pos.y = world.surface(pos.x, pos.z) + hop * (k === "frog" ? 0.5 : 0.9) * amount;
      this.group.scale.y *= 1 + Math.cos(this.gait * 0.96) * 0.19 * amount;
      this.group.scale.x *= 1 - Math.cos(this.gait * 0.96) * 0.09 * amount;
      this.group.scale.z = this.group.scale.x;
    }
    const look = dist < 7 && !alert ? THREE.MathUtils.clamp(
      Math.atan2(player.x - pos.x, player.z - pos.z) - this.heading,
      -0.65,
      0.65
    ) : Math.sin(t * 0.75) * 0.18;
    this.head.rotation.y = THREE.MathUtils.lerp(this.head.rotation.y, look, 1 - Math.exp(-dt * 6));
    this.head.rotation.x = THREE.MathUtils.lerp(
      this.head.rotation.x,
      graze ? -0.7 + Math.sin(t * 6) * 0.09 : alert ? -0.08 : Math.sin(t * 1.6) * 0.045,
      1 - Math.exp(-dt * 5)
    );
    const blink = t % 4.8 > 4.64 ? 0.13 : 1;
    for (const e of this.eyes) e.scale.y = 0.09 * blink;
    this.legs.forEach((l, i) => {
      if (k === "ghast") {
        l.rotation.x = Math.sin(t * 2.1 + i * 0.6) * 0.27;
        l.rotation.z = Math.cos(t * 1.7 + i) * 0.17;
      } else if (k === "blaze") {
        const a = t * (i % 2 ? 1.2 : -0.9) + i * Math.PI / 4;
        l.position.set(
          Math.cos(a) * (0.63 + this.attackClock * 0.45),
          0.8 + i % 2 * 0.5 + Math.sin(t * 2 + i) * 0.15,
          Math.sin(a) * 0.63
        );
        l.rotation.z = Math.sin(t + i) * 0.25;
      } else {
        l.rotation.x = Math.sin(this.gait + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.65 * this.walkBlend;
        if (["zombie", "skeleton", "piglin", "enderman"].includes(k) && i >= 2) {
          l.rotation.x += k === "zombie" ? -1.2 : 0;
          if (this.attackClock > 0)
            l.rotation.x -= Math.sin((0.65 - this.attackClock) / 0.65 * Math.PI) * 1.8;
          l.rotation.z = (i === 2 ? -1 : 1) * (0.04 + Math.sin(t * 2) * 0.025);
        }
      }
    });
    this.tails.forEach((tail, i) => {
      tail.rotation.y = Math.sin(t * (k === "fox" ? 3 : 5) + i) * 0.38;
      tail.rotation.x = (graze ? -0.1 : 0.15) + Math.sin(t * 2) * 0.12;
    });
    this.wings.forEach((wing, i) => {
      wing.rotation.z = (i === 0 ? 1 : -1) * (k === "bee" ? 0.3 + Math.sin(t * 65) * 0.85 : Math.sin(t * 12) * 0.25 * this.walkBlend);
    });
    for (const { material, emissive, intensity } of this.skinMaterials) {
      material.emissive.copy(emissive);
      material.emissiveIntensity = intensity;
      if (this.hurt > 0) {
        material.emissive.set("#ee4236");
        material.emissiveIntensity = 0.55;
      } else if (this.fuse > 0.2) {
        material.emissive.set("#fff4c2");
        material.emissiveIntensity = Math.max(0, Math.sin(t * 25)) * 0.7;
      }
    }
  }
};
var Dragon = class {
  group = new THREE.Group();
  wings = [];
  tail = [];
  neck = new THREE.Group();
  jaw = null;
  radius = 27;
  deathTime = 0;
  hp = 300;
  time = 0;
  shot = 0;
  dead = false;
  constructor() {
    const g = this.group;
    cube(g, "#30303c", 0, 0, 0, 2.2, 1.8, 5);
    cube(g, "#595363", 0, 0.7, 0, 1, 1, 3.5);
    cube(g, "#292833", 0, 0.1, -3.4, 1.35, 1.15, 2.2);
    cube(g, "#373442", 0, 0.1, -5.1, 1.7, 1.3, 1.6);
    this.jaw = cube(g, "#22222b", 0, -0.25, -6, 1.5, 0.45, 1.2);
    for (const x of [-0.65, 0.65]) {
      cube(g, "#d597ff", x, 0.4, -5.93, 0.36, 0.23, 0.04, true);
      cube(g, "#a8a0ac", x, 0.95, -4.65, 0.26, 0.85, 0.3);
    }
    for (let i = 0; i < 7; i++) {
      const m = cube(g, "#30303c", 0, 0, 3 + i * 1.25, 1.15 - i * 0.12, 0.9 - i * 0.085, 1.5);
      this.tail.push(m);
      cube(g, "#77707f", 0, 1.05, 2 - i, 0.22, 0.55, 0.35);
    }
    for (const side of [-1, 1]) {
      const wing = new THREE.Group();
      wing.position.set(side * 0.8, 0.65, -0.3);
      g.add(wing);
      cube(wing, "#544b63", side * 3.3, 0, -0.2, 6.7, 0.2, 0.23);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
          [
            0,
            0,
            -0.3,
            side * 8,
            0,
            -1.4,
            side * 6,
            0,
            3.4,
            0,
            0,
            -0.3,
            side * 6,
            0,
            3.4,
            side * 2,
            0,
            2.8
          ],
          3
        )
      );
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({
          color: "#46374f",
          side: THREE.DoubleSide,
          roughness: 1
        })
      );
      mesh.castShadow = true;
      wing.add(mesh);
      for (let i = 0; i < 3; i++) {
        const bone = cube(wing, "#6b5e76", side * (2 + i * 1.7), 0, 1.15, 0.16, 0.15, 3.4);
        bone.rotation.y = side * (0.6 - i * 0.2);
      }
      this.wings.push(wing);
      for (const z of [-1, 1.7]) cube(g, "#262632", side * 1.3, -1, z, 0.45, 1.25, 0.65);
    }
    this.neck.position.set(0, 0, -2.5);
    for (const o of g.children.slice())
      if (o instanceof THREE.Mesh && o.position.z < -2.5) {
        o.position.sub(this.neck.position);
        this.neck.add(o);
      }
    g.add(this.neck);
    this.group.position.set(27, 33, 0);
  }
  update(dt, crystals, player, shoot) {
    if (this.dead) {
      this.deathTime += dt;
      this.group.position.y -= dt * (2 + this.deathTime * 2);
      this.group.rotation.z += dt * 0.7;
      this.group.rotation.x += dt * 0.25;
      this.wings.forEach((w, i) => w.rotation.z = (i ? 1 : -1) * Math.min(1.5, this.deathTime));
      if (this.deathTime > 3) this.group.visible = false;
      return;
    }
    this.time += dt;
    this.shot -= dt;
    const t = this.time, phase = t % 24;
    this.hp = Math.min(300, this.hp + crystals * 0.12 * dt);
    const swoop = phase > 17;
    this.radius = THREE.MathUtils.lerp(this.radius, swoop ? 12 : 27, 1 - Math.exp(-dt * 1.4));
    const radius = this.radius;
    this.group.position.set(
      Math.cos(t * 0.22) * radius,
      THREE.MathUtils.lerp(
        this.group.position.y,
        swoop ? 23 : 33 + Math.sin(t * 0.5) * 4,
        1 - Math.exp(-dt * 1.7)
      ),
      Math.sin(t * 0.22) * radius
    );
    this.group.rotation.y = -t * 0.22;
    this.group.rotation.z = -0.13 + Math.sin(t * 0.55) * 0.09;
    this.group.rotation.x = swoop ? 0.08 + Math.sin(t) * 0.06 : Math.sin(t * 0.8) * 0.04;
    this.neck.rotation.x = Math.sin(t * 1.8) * 0.08 + (swoop ? 0.12 : 0);
    this.neck.rotation.y = Math.sin(t * 0.8) * 0.12;
    if (this.jaw) this.jaw.rotation.x = this.shot < 0.5 ? -0.45 : Math.sin(t * 1.2) * 0.025;
    this.wings.forEach((w, i) => {
      const side = i === 0 ? 1 : -1;
      w.rotation.z = (Math.sin(t * (swoop ? 5 : 3.7)) * 0.55 + 0.12) * side;
      w.rotation.y = Math.sin(t * 3.7 + 0.7) * side * 0.09;
      w.rotation.x = Math.cos(t * 3.7) * 0.08;
      w.scale.x = 1 - Math.max(0, Math.sin(t * 3.7)) * 0.12;
    });
    this.tail.forEach((p, i) => {
      p.position.x = Math.sin(t * 1.8 - i * 0.4) * i * 0.2;
      p.position.y = Math.cos(t * 1.3 - i * 0.3) * i * 0.07;
      p.rotation.y = Math.cos(t * 1.8 - i * 0.4) * 0.22;
      p.rotation.x = Math.sin(t * 1.3 - i * 0.3) * 0.07;
    });
    if (this.shot < 0 && this.group.position.distanceTo(player) < 70) {
      shoot(this.group.position.clone());
      this.shot = crystals ? 3.3 : 1.9;
    }
  }
};

// lib/portals.ts
function ignitePortal(w, x, y, z) {
  if (w.dimension === "end") return false;
  for (const axis of ["x", "z"])
    for (let dx = -3; dx <= 0; dx++)
      for (let dy = -4; dy <= 0; dy++) {
        const bx = x + (axis === "x" ? dx : 0), bz = z + (axis === "z" ? dx : 0), by = y + dy;
        const get = (a, b2) => w.get(bx + (axis === "x" ? a : 0), by + b2, bz + (axis === "z" ? a : 0));
        let valid = by > 0;
        for (let a = 1; a <= 2; a++) if (get(a, 0) !== 12 || get(a, 4) !== 12) valid = false;
        for (let b2 = 1; b2 <= 3; b2++) if (get(0, b2) !== 12 || get(3, b2) !== 12) valid = false;
        for (let a = 1; a <= 2; a++)
          for (let b2 = 1; b2 <= 3; b2++) if (![0, 13].includes(get(a, b2))) valid = false;
        if (valid) {
          for (let a = 1; a <= 2; a++)
            for (let b2 = 1; b2 <= 3; b2++)
              w.set(bx + (axis === "x" ? a : 0), by + b2, bz + (axis === "z" ? a : 0), 13);
          return true;
        }
      }
  return false;
}

// lib/net-protocol.ts
var PROTOCOL = 1;
var MAX_PLAYERS = 16;
var DIMENSIONS_NET = ["overworld", "nether", "end"];
function validNick(n) {
  return typeof n === "string" && /^[\p{L}\p{N}_-]{3,20}$/u.test(n);
}
function validVec(p) {
  return Array.isArray(p) && p.length === 3 && p.every((v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e5);
}
function validToken(t) {
  return typeof t === "string" && /^[a-f0-9]{64}$/.test(t);
}
function validSkin(s) {
  if (!s || typeof s !== "object") return false;
  const v = s;
  return ["skin", "cape"].every(
    (k) => typeof v[k] === "string" && v[k].length < 5e4 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v[k])
  ) && typeof v.capeEnabled === "boolean";
}
function validVoice(s) {
  return typeof s === "string" && s.length >= 320 && s.length <= 9e3 && s.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(s);
}

// server/room.ts
var vec = (p) => new THREE2.Vector3(...p);
var round = (n) => Math.round(n * 1e3) / 1e3;
var array = (p) => p.toArray().map(round);
var mobFields = [
  "hp",
  "elapsed",
  "gait",
  "walkBlend",
  "heading",
  "attackClock",
  "hurt",
  "fuse",
  "deathTime",
  "timer"
];
var Room = class {
  constructor(send, now = () => Date.now()) {
    this.send = send;
    this.now = now;
    for (const dimension of DIMENSIONS_NET) {
      const world = new World(this.seed);
      world.dimension = dimension;
      const fluid = new FluidSystem(world);
      const wake = world.onEdit;
      world.onEdit = (x, y, z) => {
        wake(x, y, z);
        const key = dimension + ":" + [x, y, z];
        this.changes.set(key, [
          dimension,
          x,
          y,
          z,
          world.get(x, y, z),
          world.waterLevels[key] ?? -1
        ]);
      };
      this.regions.set(dimension, {
        world,
        fluid,
        mobs: /* @__PURE__ */ new Map(),
        populated: /* @__PURE__ */ new Set(),
        crops: {}
      });
    }
  }
  send;
  now;
  seed = 24680;
  clock = 90;
  tickId = 0;
  sequence = 0;
  won = false;
  crystals = [];
  players = /* @__PURE__ */ new Map();
  regions = /* @__PURE__ */ new Map();
  changes = /* @__PURE__ */ new Map();
  storage = {};
  slots = {};
  chestRevisions = {};
  chat = [];
  drops = [];
  shots = [];
  dragon = new Dragon();
  region(d) {
    return this.regions.get(d);
  }
  ensure(d, x, z, r = 1) {
    const w = this.region(d).world, cx = Math.floor(x / 16), cz = Math.floor(z / 16);
    for (let a = -r; a <= r; a++) for (let b2 = -r; b2 <= r; b2++) w.chunk(cx + a, cz + b2);
    return w;
  }
  reply(p, c, data = {}) {
    const response = { type: "result", req: c.req, ...data };
    if (data.ok) {
      const inv = { ...p.profile.inventory ?? {} };
      for (const [id, n] of data.cost ?? [])
        inv[id] = Math.max(0, (inv[id] ?? 0) - n);
      for (const [id, n] of data.grant ?? []) inv[id] = (inv[id] ?? 0) + n;
      for (const [id, delta] of data.inventoryDelta ?? [])
        inv[id] = Math.max(0, (inv[id] ?? 0) + delta);
      const pack = new InventoryPack();
      if (p.profile.pack) pack.restore(p.profile.pack);
      for (const extra of pack.reconcile(inv, Number(p.profile.selected) || 0)) {
        this.drop(p.dimension, extra.id, extra.n, [p.p[0], p.p[1] + 0.7, p.p[2]]);
        inv[extra.id] -= extra.n;
      }
      p.profile.inventory = pack.counts();
      p.profile.pack = pack.snapshot();
      p.profile.inventoryRevision = (Number(p.profile.inventoryRevision) || 0) + 1;
      response.pack = pack.snapshot();
    }
    response.inventoryRevision = Number(p.profile.inventoryRevision) || 0;
    if (data.chest) {
      const chest = data.chest;
      response.chest = { ...chest, revision: this.chestRevisions[chest.key] ?? 0 };
    }
    if (!data.ok && ["inventoryGesture", "settleInventory"].includes(c.type))
      response.pack = p.profile.pack;
    const snapshot = structuredClone(response);
    p.responses[c.req] = snapshot;
    const keys = Object.keys(p.responses);
    if (keys.length > 100) delete p.responses[keys[0]];
    this.send(p.id, snapshot);
  }
  join(id, nick, skin) {
    if (!validNick(nick))
      return this.send(id, {
        type: "error",
        fatal: true,
        message: "Nick: 3\u201320 liter, cyfr, znak\xF3w _ lub -."
      });
    const active = [...this.players.values()].filter((p2) => this.now() - p2.seen < 12e3);
    if (active.some((p2) => p2.id !== id && p2.nick.toLocaleLowerCase() === nick.toLocaleLowerCase()))
      return this.send(id, {
        type: "error",
        fatal: true,
        message: "Ten nick jest zaj\u0119ty. Wybierz inny."
      });
    if (!active.some((p2) => p2.id === id) && active.length >= MAX_PLAYERS)
      return this.send(id, {
        type: "error",
        fatal: true,
        message: "Serwer jest pe\u0142ny. Spr\xF3buj za chwil\u0119."
      });
    let p = this.players.get(id);
    if (!p) {
      const w = this.ensure("overworld", 8, 22);
      p = {
        id,
        nick,
        p: [8.5, w.surface(8, 22) + 0.05, 22.5],
        yaw: 0.22,
        pitch: 0,
        dimension: "overworld",
        moving: false,
        crouch: false,
        swing: false,
        held: 0,
        seen: this.now(),
        profile: {},
        lastAction: 0,
        health: 20,
        hurtUntil: 0,
        responses: {},
        stamina: 100,
        spawnUntil: this.now() + 8e3,
        blockUntil: 0,
        blocking: false,
        grounded: true,
        armor: 0,
        healed: 0,
        lastChat: 0
      };
      this.players.set(id, p);
    }
    p.nick = nick;
    p.skin = skin;
    p.seen = this.now();
    this.send(id, {
      type: "welcome",
      id,
      seed: this.seed,
      player: this.publicPlayer(p),
      profile: p.profile,
      health: p.health,
      clock: this.clock,
      edits: this.edits(),
      water: this.water(),
      crystals: this.crystals,
      won: this.won,
      dragon: this.dragon.hp
    });
    this.send(id, { type: "history", messages: this.chat });
  }
  publicPlayer(p) {
    return {
      id: p.id,
      nick: p.nick,
      p: p.p,
      yaw: p.yaw,
      pitch: p.pitch,
      dimension: p.dimension,
      moving: p.moving,
      crouch: p.crouch,
      swing: p.swing,
      swingProgress: p.swingProgress,
      held: p.held,
      seen: p.seen,
      health: p.health
    };
  }
  input(id, m) {
    const p = this.players.get(id);
    if (!p) return;
    if (validVec(m.p) && m.p[1] > -100 && m.p[1] < 200 && DIMENSIONS_NET.includes(m.dimension)) {
      p.p = m.p;
      p.dimension = m.dimension;
      p.yaw = Number.isFinite(m.yaw) ? Number(m.yaw) : 0;
      p.pitch = Math.max(-1.54, Math.min(1.54, Number(m.pitch) || 0));
      p.moving = !!m.moving;
      p.crouch = !!m.crouch;
      p.swing = !!m.swing;
      p.swingProgress = p.swing ? Math.max(0, Math.min(1, Number(m.swingProgress) || 0)) : -1;
      p.held = Number.isInteger(m.held) && (BLOCKS[Number(m.held)] || ITEMS.some((i) => i.id === m.held)) ? Number(m.held) : 0;
      if (p.held > 0 && !this.owns(p, p.held)) p.held = 0;
      p.blocking = !!m.blocking && p.held === 126;
      p.grounded = !!m.grounded;
      p.armor = [121, 122].includes(Number(m.armor)) && this.owns(p, Number(m.armor)) ? Number(m.armor) : 0;
      p.seen = this.now();
      this.ensure(p.dimension, p.p[0], p.p[2]);
    }
  }
  profile(id, m) {
    const p = this.players.get(id);
    if (!p || !m || typeof m !== "object" || JSON.stringify(m).length > 24e3) return;
    const inventory = p.profile.inventory ?? {};
    const revision = Number(p.profile.inventoryRevision) || 0;
    let pack = p.profile.pack;
    if (m.pack && typeof m.pack === "object" && (m.inventoryRevision ?? 0) === revision) {
      const candidate = new InventoryPack();
      candidate.restore(m.pack);
      const counts = candidate.counts();
      const keys = /* @__PURE__ */ new Set([...Object.keys(counts), ...Object.keys(inventory)]);
      if ([...keys].every((k) => (counts[Number(k)] ?? 0) === (inventory[Number(k)] ?? 0)))
        pack = candidate.snapshot();
    }
    const health = p.health;
    p.profile = {
      ...m,
      inventory,
      pack,
      inventoryRevision: revision,
      lastMine: p.profile.lastMine
    };
    if (typeof m.health === "number" && Number.isFinite(m.health) && m.health < health)
      this.damage(p, health - Math.max(0, m.health));
  }
  owns(p, id, n = 1) {
    return Number.isInteger(n) && n > 0 && ((p.profile.inventory ?? {})[id] ?? 0) >= n;
  }
  command(id, c) {
    const p = this.players.get(id);
    if (!p || typeof c.req !== "string" || c.req.length > 80) return;
    if (p.responses[c.req]) {
      this.send(id, p.responses[c.req]);
      return;
    }
    const reject = (message) => this.reply(p, c, { ok: false, message });
    if (c.type === "respawn") {
      if (p.health > 0) return reject("Posta\u0107 jeszcze \u017Cyje.");
      p.health = 20;
      p.stamina = 100;
      p.spawnUntil = this.now() + 8e3;
      p.hurtUntil = this.now() + 3e3;
      p.profile = { ...p.profile, inventory: {}, pack: void 0 };
      return this.reply(p, c, { ok: true, health: 20 });
    }
    if (c.type === "heal") {
      if (this.now() - p.healed < 6e3 || Number(p.profile.food) < 14)
        return reject("Regeneracja wymaga jedzenia.");
      p.healed = this.now();
      p.health = Math.min(20, p.health + 1);
      return this.reply(p, c, { ok: true, health: p.health });
    }
    if (p.health <= 0) return reject("Najpierw odrod\u017A posta\u0107.");
    if (c.type === "transfer") return reject("U\u017Cyj p\xF3l skrzyni.");
    if (c.type === "inventoryGesture" || c.type === "settleInventory") {
      if (c.baseRevision !== (Number(p.profile.inventoryRevision) || 0))
        return reject("Ekwipunek si\u0119 zmieni\u0142. Spr\xF3buj ponownie.");
      const pack = new InventoryPack();
      pack.restore(p.profile.pack ?? {});
      pack.reconcile(p.profile.inventory ?? {});
      if (c.type === "settleInventory") {
        if (c.size !== 2 && c.size !== 3) return reject("Nieprawid\u0142owy rozmiar wytwarzania.");
        for (const extra of pack.clearGrid())
          this.drop(p.dimension, extra.id, extra.n, [p.p[0], p.p[1] + 0.7, p.p[2]]);
        pack.size = c.size;
        p.profile.pack = pack.snapshot();
        p.profile.inventory = pack.counts();
        return this.reply(p, c, { ok: true });
      }
      if (!validGesture(c.gesture)) return reject("Nieprawid\u0142owy gest ekwipunku.");
      let slots, key2 = "";
      if (c.chestKey !== null) {
        if (typeof c.chestKey !== "string" || !c.chestKey.startsWith(p.dimension + ":"))
          return reject("Skrzynia jest w innym wymiarze.");
        const [x2, y2, z2] = c.chestKey.slice(p.dimension.length + 1).split(",").map(Number);
        if (![x2, y2, z2].every(Number.isInteger) || y2 < 1 || y2 > 70 || Math.hypot(p.p[0] - x2, p.p[1] + 1 - y2, p.p[2] - z2) > 8)
          return reject("Skrzynia jest poza zasi\u0119giem.");
        const w2 = this.ensure(p.dimension, x2, z2);
        if (w2.get(x2, y2, z2) !== 61) return reject("Nie ma tutaj skrzyni.");
        key2 = p.dimension + ":" + [x2, y2, z2];
        if (!this.slots[key2]) return reject("Najpierw otw\xF3rz skrzyni\u0119.");
        slots = this.slots[key2].map((s) => s ? { ...s } : null);
      }
      if (!applyInventoryGesture(pack, c.gesture, slots))
        return reject("Stos lub pole si\u0119 zmieni\u0142y. Spr\xF3buj ponownie.");
      p.profile.pack = pack.snapshot();
      p.profile.inventory = pack.counts();
      if (slots) {
        this.slots[key2] = slots;
        this.storage[key2] = chestCounts(slots);
        const revision = this.chestRevisions[key2] = (this.chestRevisions[key2] ?? 0) + 1;
        this.send("*", { type: "chestUpdate", key: key2, slots: structuredClone(slots), revision });
      }
      return this.reply(p, c, { ok: true, ...slots ? { chest: { key: key2, slots } } : {} });
    }
    const w = this.ensure(p.dimension, p.p[0], p.p[2]);
    if (c.type === "craft") {
      const pack = new InventoryPack();
      pack.restore(p.profile.pack ?? {});
      const near = (id2) => {
        for (let x2 = -4; x2 <= 4; x2++)
          for (let y2 = -2; y2 <= 2; y2++)
            for (let z2 = -4; z2 <= 4; z2++)
              if (w.get(p.p[0] + x2, p.p[1] + y2, p.p[2] + z2) === id2) return true;
        return false;
      };
      if (pack.size === 3 && !near(28) && !near(29) && !near(30))
        return reject("Wytwarzanie 3 \xD7 3 wymaga sto\u0142u.");
      if (!pack.takeResult(near(29), !!c.quick)) return reject("Brak sk\u0142adnik\xF3w lub miejsca.");
      p.profile.pack = pack.snapshot();
      p.profile.inventory = pack.counts();
      return this.reply(p, c, { ok: true });
    }
    if (c.type === "eat") {
      if (![106, 107].includes(p.held) || !this.owns(p, p.held)) return reject("Brak jedzenia.");
      if (this.now() - p.lastAction < 600) return reject("Poczekaj chwil\u0119.");
      p.lastAction = this.now();
      p.health = Math.min(20, p.health + 2);
      p.profile.food = Math.min(20, Number(p.profile.food ?? 20) + 6);
      return this.reply(p, c, {
        ok: true,
        cost: [[p.held, 1]],
        health: p.health,
        food: p.profile.food
      });
    }
    if (c.type === "pickup") {
      const d = this.drops.find((d2) => d2.key === c.key && d2.dimension === p.dimension);
      if (!d || d.grace > 0 || vec(d.p).distanceTo(vec(p.p).add(new THREE2.Vector3(0, 0.7, 0))) > 2)
        return reject("Przedmiot jest poza zasi\u0119giem.");
      const n = Math.max(0, Math.min(d.n, Number(c.capacity) || 0));
      if (!n) return reject("Brak miejsca.");
      d.n -= n;
      this.drops = this.drops.filter((d2) => d2.n > 0);
      return this.reply(p, c, { ok: true, grant: [[d.id, n]] });
    }
    if (c.type === "drop") {
      const item = Number(c.item), n = Math.floor(Number(c.n));
      if (!this.validItem(item) || n < 1 || n > 64 || !validVec(c.v))
        return reject("Nieprawid\u0142owy przedmiot.");
      if (!this.owns(p, item, n)) return reject("Brak przedmiot\xF3w do wyrzucenia.");
      this.drop(
        p.dimension,
        item,
        n,
        [p.p[0], p.p[1] + 1.3, p.p[2]],
        c.v.map((v) => Math.max(-8, Math.min(8, v)))
      );
      return this.reply(p, c, { ok: true, cost: [[item, n]] });
    }
    if (c.type === "pvp") {
      const target = this.players.get(String(c.target));
      const stats = weapon(p.held);
      if (!target || target.id === p.id || target.dimension !== p.dimension || this.now() - target.seen > 12e3 || target.health <= 0)
        return reject("Gracz jest poza zasi\u0119giem.");
      if (this.safe(p) || this.safe(target) || this.now() < p.spawnUntil || this.now() < target.spawnUntil)
        return reject("Tutaj dzia\u0142a ochrona gracza.");
      if (this.now() - p.lastAction < stats.cooldown * 1e3 || p.stamina < stats.stamina)
        return reject("Zaczekaj, a\u017C odzyskasz wytrzyma\u0142o\u015B\u0107.");
      const from = vec(p.p).add(new THREE2.Vector3(0, 1.5, 0)), to = vec(target.p).add(new THREE2.Vector3(0, 1, 0)), delta = to.clone().sub(from);
      if (delta.length() > stats.reach + 0.65) return reject("Za daleko.");
      const aim = new THREE2.Vector3(
        -Math.sin(p.yaw) * Math.cos(p.pitch),
        Math.sin(p.pitch),
        -Math.cos(p.yaw) * Math.cos(p.pitch)
      );
      if (aim.dot(delta.clone().normalize()) < 0.45 || !this.lineClear(w, from, to))
        return reject("Cel jest zas\u0142oni\u0119ty.");
      p.lastAction = this.now();
      p.stamina -= stats.stamina;
      const critical = !p.grounded && p.p[1] > target.p[1] + 0.25;
      let damage = stats.damage * (critical ? 1.25 : 1);
      const toAttacker = vec(p.p).sub(vec(target.p)).normalize(), facing = new THREE2.Vector3(-Math.sin(target.yaw), 0, -Math.cos(target.yaw));
      if (target.blocking && this.now() > target.blockUntil && target.stamina >= 10 && facing.dot(toAttacker) > 0.15) {
        target.stamina -= 15;
        if (stats.shieldBreak) {
          target.blockUntil = this.now() + 1800;
          damage *= 0.65;
        } else damage *= 0.25;
      }
      damage *= target.armor === 122 ? 0.55 : target.armor === 121 ? 0.75 : 1;
      const knock = delta.normalize().multiplyScalar(stats.knockback);
      knock.y = 2.8;
      this.damage(target, Math.max(1, Math.round(damage)), array(knock));
      return this.reply(p, c, { ok: true, message: critical ? "Trafienie krytyczne!" : void 0 });
    }
    if (c.type === "hit") {
      if (this.now() - p.lastAction < weapon(p.held).cooldown * 1e3)
        return reject("Poczekaj na kolejny zamach.");
      p.lastAction = this.now();
      const mob = this.region(p.dimension).mobs.get(String(c.target));
      const power = weapon(p.held).damage;
      if (mob && !mob.dead && vec(p.p).distanceTo(mob.group.position) < 6) {
        this.hitMob(p, mob, power);
        return this.reply(p, c, { ok: true });
      }
      if (p.dimension === "end" && c.target === "dragon" && !this.won && vec(p.p).distanceTo(this.dragon.group.position) < 8) {
        this.hitDragon(power);
        return this.reply(p, c, { ok: true });
      }
      const ci = Number(c.crystal);
      if (p.dimension === "end" && Number.isInteger(ci) && ci >= 0 && ci < 8 && vec(p.p).distanceTo(this.crystalPosition(ci)) < 6) {
        this.breakCrystal(ci);
        return this.reply(p, c, { ok: true });
      }
      return reject("Cel jest poza zasi\u0119giem.");
    }
    if (c.type === "shoot") {
      if (p.held !== 105 || !this.owns(p, 105) || !this.owns(p, 113))
        return reject("Brak \u0142uku lub strza\u0142.");
      if (this.now() - p.lastAction < 400 || !validVec(c.direction))
        return reject("Poczekaj na kolejny strza\u0142.");
      p.lastAction = this.now();
      this.shots.push({
        p: vec(p.p).add(new THREE2.Vector3(0, 1.55, 0)),
        v: vec(c.direction).normalize().multiplyScalar(37),
        dimension: p.dimension,
        owner: p.id,
        life: 5
      });
      return this.reply(p, c, { ok: true, cost: [[113, 1]], shot: true });
    }
    const x = Number(c.x), y = Number(c.y), z = Number(c.z);
    if (![x, y, z].every(Number.isInteger) || y < 1 || y > 70 || Math.hypot(p.p[0] - x, p.p[1] + 1 - y, p.p[2] - z) > 8)
      return reject("Blok jest poza zasi\u0119giem.");
    this.ensure(p.dimension, x, z);
    const block = w.get(x, y, z), key = p.dimension + ":" + [x, y, z];
    if (c.type === "chest" || c.type === "chestClick") {
      if (block !== 61) return reject("Nie ma tutaj skrzyni.");
      if (!this.storage[key]) {
        this.storage[key] = Object.hasOwn(w.edits, key) ? {} : { 107: 3, 113: 16, 110: 2 + Math.floor(hash2(x, z, this.seed) * 4), 116: 6 };
        if (Math.hypot(x, z) > 29 && !Object.hasOwn(w.edits, key)) {
          this.storage[key][119] = 1;
          this.storage[key][111] = 2;
        }
      }
      this.slots[key] ??= fromCounts(this.storage[key]);
      const storage = this.storage[key];
      let grant = [], cost = [];
      if (c.type === "chestClick") {
        const index = Number(c.index);
        if (!Number.isInteger(index) || index < 0 || index >= 27)
          return reject("Nieprawid\u0142owe pole.");
        const cursor = c.cursor;
        if (cursor && (!this.validItem(cursor.id) || !Number.isInteger(cursor.n) || cursor.n < 1 || cursor.n > maxStack(cursor.id)))
          return reject("Nieprawid\u0142owy stos.");
        if (cursor && !this.owns(p, cursor.id, cursor.n)) return reject("Nie masz tego stosu.");
        let nextCursor = cursor;
        if (c.quick) {
          const stack = this.slots[key][index];
          if (stack) {
            const n = Math.max(0, Math.min(stack.n, Number(c.capacity) || 0));
            grant = [[stack.id, n]];
            stack.n -= n;
            if (!stack.n) this.slots[key][index] = null;
          }
        } else {
          const result = clickStack(this.slots[key][index], cursor, !!c.right);
          this.slots[key][index] = result.slot;
          nextCursor = result.cursor;
        }
        if (!c.quick) {
          const current = new InventoryPack();
          current.restore(p.profile.pack ?? {});
          current.cursor = nextCursor;
          p.profile.pack = current.snapshot();
        }
        this.storage[key] = chestCounts(this.slots[key]);
        const revision = this.chestRevisions[key] = (this.chestRevisions[key] ?? 0) + 1;
        this.send("*", {
          type: "chestUpdate",
          key,
          slots: structuredClone(this.slots[key]),
          revision
        });
        return this.reply(p, c, {
          ok: true,
          chest: { key, slots: this.slots[key] },
          cursor: nextCursor,
          inventoryDelta: c.quick ? [] : [
            ...cursor ? [[cursor.id, -cursor.n]] : [],
            ...nextCursor ? [[nextCursor.id, nextCursor.n]] : []
          ],
          grant
        });
      }
      return this.reply(p, c, {
        ok: true,
        chest: { key, items: { ...storage }, slots: this.slots[key] },
        grant,
        cost
      });
    }
    if (this.now() - p.lastAction < 110) return reject("Poczekaj chwil\u0119.");
    p.lastAction = this.now();
    if (c.type === "mine") {
      const elapsed = this.now() - (Number(p.profile.lastMine) || 0);
      if (elapsed < miningDuration(block, p.held) * 650)
        return reject("Blok wymaga d\u0142u\u017Cszego kopania.");
      p.profile.lastMine = this.now();
      if (block !== c.expected || !block || [7, 13, 18, 35].includes(block))
        return reject("Ten blok ju\u017C si\u0119 zmieni\u0142.");
      if (block === 12 && p.held !== 103) return reject("Obsydian wymaga diamentowego kilofa.");
      w.set(x, y, z, 0);
      const grant = [];
      if ([64, 65, 66].includes(block)) {
        grant.push([116, block === 66 ? 3 : 1]);
        if (block === 66) grant.push([117, 2]);
        delete this.region(p.dimension).crops[key];
      } else if (block === 79) {
        if (Math.random() < 0.65) grant.push([116, 1]);
      } else
        grant.push([
          block === 1 ? 2 : block === 3 ? 9 : block === 20 ? 109 : block === 22 ? 111 : block === 42 && Math.random() < 0.22 ? 124 : block,
          1
        ]);
      if (block === 61 && this.storage[key]) {
        for (const [i, n] of Object.entries(this.storage[key])) grant.push([Number(i), n]);
        delete this.storage[key];
        delete this.slots[key];
      }
      return this.reply(p, c, { ok: true, grant, mined: true, xp: block === 22 ? 8 : 1 });
    }
    if (c.type === "use") {
      const held = p.held;
      if (block !== 62 && held > 0 && !this.owns(p, held)) return reject("Brak przedmiotu.");
      if (held === 123) {
        const ok = ignitePortal(w, x, y, z);
        return this.reply(p, c, {
          ok,
          message: ok ? "Portal rozpalony." : "Napraw obsydianow\u0105 ram\u0119 portalu."
        });
      }
      if (held === 118 && [1, 2, 54].includes(block)) {
        w.set(x, y, z, 63);
        return this.reply(p, c, { ok: true });
      }
      if (held === 114 && block === 7 && (w.waterLevels[key] ?? 0) === 0) {
        w.set(x, y, z, 0);
        return this.reply(p, c, { ok: true, cost: [[114, 1]], grant: [[115, 1]] });
      }
      if (block === 62) {
        if (this.clock % 600 > 330) this.clock = Math.ceil(this.clock / 600) * 600 + 90;
        return this.reply(p, c, { ok: true, message: "Punkt odrodzenia ustawiony.", bed: true });
      }
      if (!validVec(c.place) || !c.place.every(Number.isInteger)) return reject("Brak miejsca.");
      const [a, b2, d] = c.place;
      if (Math.hypot(a - x, b2 - y, d - z) > 1.01 || b2 < 1 || b2 > 70)
        return reject("Nieprawid\u0142owe miejsce.");
      this.ensure(p.dimension, a, d);
      const old = w.get(a, b2, d);
      if (old !== 0 && old !== 7 && !BLOCKS[old]?.plant) return reject("To miejsce jest zaj\u0119te.");
      const next = held === 115 ? 7 : held === 116 ? 64 : held;
      if (!BLOCKS[next] || next < 1 || next === 35 || next === 13 || next === 18)
        return reject("Nie mo\u017Cna postawi\u0107 tego przedmiotu.");
      if (held === 116 && (p.dimension !== "overworld" || w.get(a, b2 - 1, d) !== 63))
        return reject("Nasiona wymagaj\u0105 ziemi uprawnej.");
      if (BLOCKS[next].solid && [...this.players.values()].some(
        (q) => this.now() - q.seen < 12e3 && q.dimension === p.dimension && a + 1 > q.p[0] - 0.3 && a < q.p[0] + 0.3 && d + 1 > q.p[2] - 0.3 && d < q.p[2] + 0.3 && b2 + 1 > q.p[1] && b2 < q.p[1] + 1.8
      ))
        return reject("W tym miejscu stoi gracz.");
      if (!(held === 115 && p.dimension === "nether")) w.set(a, b2, d, next);
      if (next === 64) this.region(p.dimension).crops[p.dimension + ":" + [a, b2, d]] = 0;
      return this.reply(p, c, {
        ok: true,
        cost: [[held, 1]],
        grant: held === 115 ? [[114, 1]] : [],
        placed: true
      });
    }
    reject("Nieznana akcja.");
  }
  validItem(id) {
    return Number.isInteger(id) && id > 0 && (!!BLOCKS[id] || ITEMS.some((i) => i.id === id));
  }
  drop(dimension, id, n, p, v = [0, 2, 0]) {
    if (this.drops.length >= 300) return;
    this.drops.push({
      key: "d" + ++this.sequence,
      dimension,
      id,
      n,
      p: [...p],
      v: [...v],
      life: 300,
      grace: 1
    });
  }
  damage(p, n, knockback = [0, 0, 0]) {
    if (p.health <= 0 || p.hurtUntil > this.now()) return;
    p.health = Math.max(0, p.health - n);
    p.hurtUntil = this.now() + 800;
    if (p.health === 0) {
      const inventory = p.profile.inventory ?? {};
      for (const [id, n2] of Object.entries(inventory))
        if (this.validItem(Number(id)))
          this.drop(p.dimension, Number(id), Math.min(2304, Number(n2) || 0), [
            p.p[0],
            p.p[1] + 0.7,
            p.p[2]
          ]);
      p.profile = { ...p.profile, inventory: {}, pack: void 0 };
      this.message("Serwer", p.nick + " poleg\u0142. Przedmioty czekaj\u0105 w miejscu \u015Bmierci.", true);
    }
    if (p.health === 0)
      p.profile.inventoryRevision = (Number(p.profile.inventoryRevision) || 0) + 1;
    this.send(p.id, {
      type: "damage",
      health: p.health,
      amount: n,
      knockback,
      inventoryRevision: Number(p.profile.inventoryRevision) || 0
    });
  }
  safe(p) {
    return p.dimension === "overworld" && Math.hypot(p.p[0] - 8, p.p[2] - 22) < 12;
  }
  lineClear(w, a, b2) {
    const delta = b2.clone().sub(a), distance = delta.length();
    delta.normalize();
    for (let t = 0.25; t < distance - 0.3; t += 0.25) {
      const p = a.clone().addScaledVector(delta, t);
      if (w.solid(p.x, p.y, p.z)) return false;
    }
    return true;
  }
  message(nick, text, system = false) {
    const message = { nick, text, time: this.now(), system };
    this.chat.push(message);
    this.chat = this.chat.slice(-60);
    this.send("*", { type: "chat", ...message });
  }
  chatMessage(id, text) {
    const p = this.players.get(id);
    if (!p || typeof text !== "string" || this.now() - p.lastChat < 800) return;
    const value = text.split("").filter((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127).join("").trim().slice(0, 240);
    if (!value) return;
    p.lastChat = this.now();
    this.message(p.nick, value);
  }
  hitMob(p, m, n) {
    if (m.dead) return;
    m.hp -= n;
    m.hurt = 0.3;
    if (m.hp <= 0) {
      m.die();
      this.drop(
        p.dimension,
        m.hostile ? 109 : m.kind === "sheep" ? 32 : 107,
        m.hostile ? 2 : 1,
        array(m.group.position)
      );
      if (m.kind === "enderman") this.drop(p.dimension, 111, 1, array(m.group.position));
      this.send(p.id, { type: "award", xp: m.hostile ? 8 : 3 });
    }
  }
  hitDragon(n) {
    if (this.won) return;
    this.dragon.hp = Math.max(0, this.dragon.hp - n);
    if (this.dragon.hp <= 0) {
      this.won = true;
      this.dragon.dead = true;
      this.dragon.deathTime = 0;
      for (const p of this.players.values())
        if (this.now() - p.seen < 12e3)
          this.send(p.id, {
            type: "award",
            xp: 500,
            message: "Wsp\xF3lne zwyci\u0119stwo! Smok pokonany."
          });
    }
  }
  crystalPosition(i) {
    const a = i / 8 * Math.PI * 2;
    return new THREE2.Vector3(
      Math.round(Math.cos(a) * 29) + 0.5,
      31 + i % 3 * 4,
      Math.round(Math.sin(a) * 29) + 0.5
    );
  }
  breakCrystal(i) {
    if (!this.crystals.includes(i)) this.crystals.push(i);
  }
  populate(p) {
    const r = this.region(p.dimension), cell = Math.floor(p.p[0] / 48) + "," + Math.floor(p.p[2] / 48);
    if (r.populated.has(cell) || r.mobs.size >= 24) return;
    r.populated.add(cell);
    const kinds = p.dimension === "end" ? ["enderman", "enderman"] : p.dimension === "nether" ? ["piglin", "blaze", "ghast"] : this.clock % 600 > 350 ? ["zombie", "creeper", "skeleton"] : [r.world.biomeInfo(p.p[0], p.p[2]).mob, "sheep", "pig", "bee"];
    for (let i = 0; i < kinds.length; i++) {
      const a = i / kinds.length * Math.PI * 2, x = p.p[0] + Math.cos(a) * 16, z = p.p[2] + Math.sin(a) * 16;
      this.ensure(p.dimension, x, z);
      const m = new Mob(kinds[i], x, z, r.world);
      r.mobs.set("m" + ++this.sequence, m);
    }
  }
  tick(dt) {
    this.clock += dt;
    this.tickId++;
    const active = [...this.players.values()].filter((p) => this.now() - p.seen < 12e3);
    for (const p of active) {
      p.stamina = Math.min(100, p.stamina + dt * (p.blocking ? 5 : 18));
      this.populate(p);
    }
    for (const [dimension, r] of this.regions) {
      const targets = active.filter((p) => p.dimension === dimension && p.health > 0);
      if (!targets.length) continue;
      r.fluid.tick(dt);
      for (const [id, m] of r.mobs) {
        let p = targets[0];
        for (const q of targets)
          if (vec(q.p).distanceToSquared(m.group.position) < vec(p.p).distanceToSquared(m.group.position))
            p = q;
        m.update(
          dt,
          this.clock,
          vec(p.p),
          r.world,
          (n) => this.damage(p, n),
          (pos) => this.enemyShot(dimension, pos, p),
          (pos) => {
            for (const q of targets) if (vec(q.p).distanceTo(pos) < 4) this.damage(q, 8);
            for (let x = -2; x <= 2; x++)
              for (let y = 0; y < 3; y++)
                for (let z = -2; z <= 2; z++)
                  if (x * x + y * y + z * z < 6) {
                    const a = Math.floor(pos.x + x), b2 = Math.floor(pos.y + y), c = Math.floor(pos.z + z), block = r.world.get(a, b2, c);
                    if (block && ![12, 13, 18, 35].includes(block)) r.world.set(a, b2, c, 0);
                  }
          }
        );
        if (m.dead && m.deathTime > 1.4 || !targets.some((q) => vec(q.p).distanceTo(m.group.position) < 110)) {
          m.dispose();
          r.mobs.delete(id);
          r.populated.clear();
        }
      }
      if (this.tickId % 20 === 0) {
        for (const key of Object.keys(r.crops)) {
          const [x, y, z] = key.split(":")[1].split(",").map(Number);
          const id = r.world.get(x, y, z);
          if (![64, 65, 66].includes(id)) {
            delete r.crops[key];
            continue;
          }
          if (id === 66) continue;
          let wet = false;
          for (let a = -4; a <= 4 && !wet; a++)
            for (let b2 = -4; b2 <= 4; b2++) if (r.world.get(x + a, y - 1, z + b2) === 7) wet = true;
          r.crops[key] += wet ? 1 : 0.18;
          const next = r.crops[key] >= 60 ? 66 : r.crops[key] >= 30 ? 65 : 64;
          if (next !== id) r.world.set(x, y, z, next);
        }
        if (r.world.chunks.size > 180) {
          for (const [key, c] of r.world.chunks)
            if (!targets.some(
              (p) => Math.abs(p.p[0] / 16 - c.cx) < 5 && Math.abs(p.p[2] / 16 - c.cz) < 5
            ))
              r.world.chunks.delete(key);
        }
      }
    }
    const end = active.filter((p) => p.dimension === "end" && p.health > 0);
    if (end.length)
      this.dragon.update(
        dt,
        8 - this.crystals.length,
        vec(end[0].p),
        (pos) => this.enemyShot("end", pos, end[Math.floor(Math.random() * end.length)])
      );
    for (const s of this.shots) {
      s.life -= dt;
      s.p.addScaledVector(s.v, dt);
      const w = this.ensure(s.dimension, s.p.x, s.p.z, 0);
      if (w.solid(s.p.x, s.p.y, s.p.z)) s.life = 0;
      if (!s.owner) {
        for (const p of active)
          if (p.dimension === s.dimension && vec(p.p).add(new THREE2.Vector3(0, 1, 0)).distanceTo(s.p) < 0.9) {
            if (!this.safe(p) && this.now() > p.spawnUntil) this.damage(p, 4);
            s.life = 0;
            break;
          }
      } else {
        const p = this.players.get(s.owner);
        if (p) {
          for (const target of active)
            if (target.id !== p.id && target.dimension === s.dimension && target.health > 0 && !this.safe(target) && !this.safe(p) && this.now() > target.spawnUntil && this.now() > p.spawnUntil && vec(target.p).add(new THREE2.Vector3(0, 1, 0)).distanceTo(s.p) < 0.8) {
              this.damage(target, 7, array(s.v.clone().normalize().multiplyScalar(3)));
              s.life = 0;
              break;
            }
          for (const m of this.region(s.dimension).mobs.values())
            if (!m.dead && m.group.position.clone().add(new THREE2.Vector3(0, 1, 0)).distanceTo(s.p) < m.size + 0.4) {
              this.hitMob(p, m, 20);
              s.life = 0;
              break;
            }
          if (s.dimension === "end") {
            for (let i = 0; i < 8; i++)
              if (!this.crystals.includes(i) && this.crystalPosition(i).distanceTo(s.p) < 1.4) {
                this.breakCrystal(i);
                s.life = 0;
              }
            if (!this.won && this.dragon.group.position.distanceTo(s.p) < 3.4) {
              this.hitDragon(20);
              s.life = 0;
            }
          }
        }
      }
    }
    this.shots = this.shots.filter((s) => s.life > 0);
    for (const d of this.drops) {
      d.life -= dt;
      d.grace -= dt;
      const w = this.ensure(d.dimension, d.p[0], d.p[2], 0);
      d.v[1] -= 14 * dt;
      for (let a = 0; a < 3; a++) {
        const old = d.p[a];
        d.p[a] += d.v[a] * dt;
        if (w.solid(d.p[0], d.p[1] - 0.13, d.p[2]) || w.solid(d.p[0], d.p[1] + 0.1, d.p[2])) {
          d.p[a] = old;
          d.v[a] = 0;
        }
      }
      d.v[0] *= Math.exp(-dt * 2);
      d.v[2] *= Math.exp(-dt * 2);
    }
    this.drops = this.drops.filter((d) => d.life > 0 && d.n > 0 && d.p[1] > -30);
  }
  enemyShot(d, pos, p) {
    this.shots.push({
      p: pos.clone(),
      v: vec(p.p).add(new THREE2.Vector3(0, 1, 0)).sub(pos).normalize().multiplyScalar(12),
      dimension: d,
      owner: "",
      life: 6
    });
  }
  mobWire(id, m) {
    const values = Object.fromEntries(mobFields.map((k) => [k, round(m[k])]));
    return {
      id,
      kind: m.kind,
      p: array(m.group.position),
      r: [m.group.rotation.x, m.group.rotation.y, m.group.rotation.z].map(round),
      dead: m.dead,
      ...values,
      target: [999, 0, 999],
      head: [round(m.head.rotation.x), round(m.head.rotation.y)]
    };
  }
  frame() {
    const mobs = {};
    for (const [d, r] of this.regions) mobs[d] = [...r.mobs].map(([id, m]) => this.mobWire(id, m));
    const dragon = {
      hp: round(this.dragon.hp),
      time: this.dragon.time,
      shot: this.dragon.shot,
      radius: this.dragon.radius,
      dead: this.dragon.dead,
      deathTime: this.dragon.deathTime,
      p: array(this.dragon.group.position),
      r: [
        this.dragon.group.rotation.x,
        this.dragon.group.rotation.y,
        this.dragon.group.rotation.z
      ]
    };
    const changes = [...this.changes.values()];
    this.changes.clear();
    return {
      combat: Object.fromEntries(
        [...this.players].map(([id, p]) => [
          id,
          { stamina: round(p.stamina), protection: Math.max(0, p.spawnUntil - this.now()) }
        ])
      ),
      type: "frame",
      tick: this.tickId,
      clock: this.clock,
      players: [...this.players.values()].filter((p) => this.now() - p.seen < 12e3).map((p) => this.publicPlayer(p)),
      mobs,
      drops: this.drops,
      dragon,
      crystals: this.crystals,
      won: this.won,
      changes,
      shots: this.shots.map((s) => ({ p: array(s.p), dimension: s.dimension, enemy: !s.owner }))
    };
  }
  edits() {
    return Object.assign({}, ...[...this.regions.values()].map((r) => r.world.edits));
  }
  water() {
    return Object.assign({}, ...[...this.regions.values()].map((r) => r.world.waterLevels));
  }
  save() {
    return {
      version: 1,
      seed: this.seed,
      clock: this.clock,
      tick: this.tickId,
      sequence: this.sequence,
      won: this.won,
      crystals: this.crystals,
      dragon: this.frameDragon(),
      edits: this.edits(),
      water: this.water(),
      storage: this.storage,
      slots: this.slots,
      chestRevisions: this.chestRevisions,
      chat: this.chat,
      drops: this.drops,
      players: [...this.players.values()],
      regions: [...this.regions].map(([d, r]) => ({
        d,
        mobs: [...r.mobs].map(([id, m]) => this.mobWire(id, m)),
        populated: [...r.populated],
        crops: r.crops
      }))
    };
  }
  frameDragon() {
    return {
      hp: this.dragon.hp,
      time: this.dragon.time,
      dead: this.dragon.dead,
      deathTime: this.dragon.deathTime
    };
  }
  restore(s) {
    if (s.version !== 1) throw Error("Unsupported world");
    this.clock = s.clock;
    this.tickId = s.tick;
    this.sequence = s.sequence;
    this.won = s.won;
    this.crystals = s.crystals;
    this.storage = s.storage;
    this.slots = s.slots ?? {};
    this.chestRevisions = s.chestRevisions ?? {};
    this.chat = s.chat ?? [];
    this.drops = s.drops;
    Object.assign(this.dragon, s.dragon);
    this.players = new Map(s.players.map((p) => [p.id, { ...p, seen: 0 }]));
    for (const rr of s.regions) {
      const r = this.region(rr.d);
      r.world.edits = Object.fromEntries(
        Object.entries(s.edits).filter(([key]) => key.startsWith(rr.d + ":"))
      );
      r.world.waterLevels = Object.fromEntries(
        Object.entries(s.water).filter(([key]) => key.startsWith(rr.d + ":"))
      );
      r.world.chunks.clear();
      r.populated = new Set(rr.populated);
      r.crops = rr.crops;
      for (const m of r.mobs.values()) m.dispose();
      r.mobs.clear();
      for (const wire of rr.mobs) {
        this.ensure(rr.d, wire.p[0], wire.p[2]);
        const m = new Mob(wire.kind, wire.p[0], wire.p[2], r.world);
        for (const k of mobFields) m[k] = wire[k];
        m.dead = wire.dead;
        m.group.position.fromArray(wire.p);
        m.group.rotation.set(...wire.r);
        r.mobs.set(wire.id, m);
      }
      for (const key of Object.keys(s.water)) {
        if (!key.startsWith(rr.d + ":")) continue;
        const [x, y, z] = key.split(":")[1].split(",").map(Number);
        r.fluid.wake(x, y, z);
      }
    }
  }
};

// server/gateway.ts
var RENEW = "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('PEXPIRE',KEYS[1],ARGV[2]) else return 0 end";
var RELEASE = "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end";
var PERSIST = "if redis.call('GET',KEYS[1])==ARGV[1] then redis.call('SET',KEYS[2],ARGV[2]);return 1 else return 0 end";
var REDIS_CODEC_PREFIX = "MINECRAFTGRA:GZIP1:";
function encodeRedis(value, forceCompression = false) {
  const json = JSON.stringify(value);
  if (!forceCompression && Buffer.byteLength(json) <= 1024) return json;
  const encoded = REDIS_CODEC_PREFIX + gzipSync(json, { level: 1 }).toString("base64");
  return forceCompression || encoded.length < Buffer.byteLength(json) ? encoded : json;
}
function decodeRedis(value) {
  const json = value.startsWith(REDIS_CODEC_PREFIX) ? gunzipSync(Buffer.from(value.slice(REDIS_CODEC_PREFIX.length), "base64"), {
    maxOutputLength: 64 * 1024 * 1024
  }).toString("utf8") : value;
  return JSON.parse(json);
}
async function redisStore(url) {
  const command = createClient({
    url,
    socket: { connectTimeout: 6e3, reconnectStrategy: (retries) => Math.min(250 * retries, 2e3) }
  });
  const sub = command.duplicate();
  command.on("error", () => {
  });
  sub.on("error", () => {
  });
  await Promise.all([command.connect(), sub.connect()]);
  return {
    get: (k) => command.get(k),
    set: (k, v, o) => command.set(k, v, o),
    eval: (s, o) => command.eval(s, o),
    publish: (c, v) => command.publish(c, v),
    subscribe: (c, fn) => sub.subscribe(c, fn),
    close: async () => {
      await Promise.allSettled([command.quit(), sub.quit()]);
    }
  };
}
var Gateway = class {
  constructor(options = {}) {
    this.options = options;
    this.local = options.local ?? !process.env.VERCEL;
    this.namespace = options.namespace ?? process.env.WORLD_NAMESPACE ?? "minecraftgra-v1";
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(this.namespace)) throw Error("Invalid WORLD_NAMESPACE");
    this.out = this.namespace + ":out";
    this.incoming = this.namespace + ":in";
    this.lease = this.namespace + ":leader";
    this.snapshot = this.namespace + ":snapshot";
  }
  options;
  node = randomUUID();
  room = null;
  store = null;
  peers = /* @__PURE__ */ new Map();
  timer = null;
  leaseUntil = 0;
  nextLease = 0;
  nextPersist = 0;
  lastTick = 0;
  busy = false;
  starting = null;
  closed = false;
  local;
  namespace;
  out;
  incoming;
  lease;
  snapshot;
  async init() {
    if (this.starting) return this.starting;
    this.starting = this.start();
    return this.starting;
  }
  async start() {
    this.closed = false;
    if (this.options.store) this.store = this.options.store;
    else if (process.env.REDIS_URL) this.store = await redisStore(process.env.REDIS_URL);
    else if (!this.local) throw Error("SETUP_REDIS");
    if (this.store) {
      await this.store.subscribe(this.out, (v) => {
        try {
          this.route(decodeRedis(v));
        } catch {
        }
      });
      await this.store.subscribe(this.incoming, (v) => {
        if (this.room && Date.now() < this.leaseUntil)
          try {
            this.handle(decodeRedis(v));
          } catch {
          }
      });
    } else {
      this.room = this.makeRoom();
      if (this.options.file)
        try {
          this.room.restore(JSON.parse(await readFile(this.options.file, "utf8")));
        } catch {
        }
      this.leaseUntil = Infinity;
    }
    this.lastTick = Date.now();
    this.timer = setInterval(() => void this.step(), 50);
    await this.step();
  }
  makeRoom() {
    return new Room((id, data) => this.broadcast({ type: "delivery", id, data }));
  }
  async step() {
    if (this.busy || this.closed) return;
    this.busy = true;
    try {
      const now = Date.now();
      if (this.store && now >= this.nextLease) {
        this.nextLease = now + 2e3;
        if (this.room) {
          const ok = await this.store.eval(RENEW, {
            keys: [this.lease],
            arguments: [this.node, "8000"]
          });
          if (ok) this.leaseUntil = Date.now() + 6e3;
          else {
            this.room = null;
            this.leaseUntil = 0;
          }
        } else if (await this.store.set(this.lease, this.node, { NX: true, PX: 8e3 })) {
          const raw = await this.store.get(this.snapshot);
          this.room = this.makeRoom();
          if (raw) this.room.restore(decodeRedis(raw));
          this.leaseUntil = Date.now() + 6e3;
          this.nextPersist = 0;
          this.broadcast({ type: "delivery", id: "*", data: { type: "resync" } });
        }
      }
      if (this.room && now < this.leaseUntil) {
        const dt = Math.min(0.1, Math.max(1e-3, (now - this.lastTick) / 1e3));
        this.room.tick(dt);
        if (this.room.tickId % 2 === 0)
          this.broadcast({ type: "delivery", id: "*", data: this.room.frame() });
        if (now >= this.nextPersist) {
          this.nextPersist = now + 2e3;
          await this.persist();
        }
      }
      this.lastTick = now;
    } catch {
      this.leaseUntil = 0;
      for (const p of this.peers.values())
        this.send(p.socket, {
          type: "error",
          message: "Po\u0142\u0105czenie z zapisem \u015Bwiata przerwane. Trwa ponawianie\u2026"
        });
    } finally {
      this.busy = false;
    }
  }
  async persist() {
    if (!this.room) return false;
    const data = this.room.save();
    if (this.store)
      return await this.store.eval(PERSIST, {
        keys: [this.lease, this.snapshot],
        arguments: [this.node, encodeRedis(data, true)]
      }) === 1;
    if (this.options.file) await writeFile(this.options.file, JSON.stringify(data), "utf8");
    return true;
  }
  broadcast(packet) {
    const publish = () => {
      if (this.store) void this.store.publish(this.out, encodeRedis(packet)).catch(() => {
      });
      else this.route(packet);
    };
    if (packet.type === "delivery" && packet.data?.type === "result" && packet.data.ok && this.store) {
      void this.persist().then((saved) => {
        if (saved) publish();
      }).catch(() => {
      });
    } else publish();
  }
  route(packet) {
    if (packet.type === "connection") {
      for (const p of this.peers.values())
        if (p.id === packet.id && p.connection !== packet.connection) {
          this.send(p.socket, {
            type: "error",
            fatal: true,
            message: "Ten profil po\u0142\u0105czy\u0142 si\u0119 w innej karcie."
          });
          p.socket.close(4001, "Profile connected elsewhere");
        }
      return;
    }
    for (const p of this.peers.values())
      if (p.joined && (packet.id === "*" || p.id === packet.id)) {
        if (packet.type === "voice" && p.id !== packet.id && packet.data?.sender !== p.id)
          this.send(p.socket, { type: "voice", ...packet.data });
        else if (packet.type === "delivery") {
          let data = packet.data;
          if (data.type === "frame") {
            const self = data.players.find((q) => q.id === p.id), dimension = self?.dimension ?? "overworld";
            data = {
              ...data,
              mobs: { [dimension]: data.mobs[dimension] },
              drops: data.drops.filter((d) => d.dimension === dimension),
              shots: data.shots.filter((s) => s.dimension === dimension),
              dragon: dimension === "end" ? data.dragon : null
            };
          }
          this.send(p.socket, data);
        }
      }
  }
  forward(packet) {
    if (this.closed) return;
    if (!this.store || this.room && Date.now() < this.leaseUntil) this.handle(packet);
    else void this.store.publish(this.incoming, encodeRedis(packet)).catch(() => {
    });
  }
  handle(packet) {
    const room = this.room;
    if (!room) return;
    const { id, data } = packet;
    if (packet.type === "join") {
      room.join(id, data.nick, data.skin);
      const p = room.players.get(id);
      if (p) {
        this.broadcast({
          type: "delivery",
          id: "*",
          data: { type: "appearance", id, nick: p.nick, skin: p.skin }
        });
        for (const q of room.players.values())
          if (q.id !== id && Date.now() - q.seen < 12e3)
            this.broadcast({
              type: "delivery",
              id,
              data: { type: "appearance", id: q.id, nick: q.nick, skin: q.skin }
            });
      }
    } else if (packet.type === "input") room.input(id, data);
    else if (packet.type === "command") room.command(id, data);
    else if (packet.type === "profile") room.profile(id, data);
    else if (packet.type === "chat") room.chatMessage(id, data);
    else if (packet.type === "leave") {
      const p = room.players.get(id);
      if (p) p.seen = 0;
    }
  }
  send(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
      if (ws.bufferedAmount > 2e6) {
        ws.close(1013, "Slow connection");
        return;
      }
      ws.send(JSON.stringify(data));
    }
  }
  async accept(ws) {
    try {
      await this.init();
    } catch (e) {
      this.send(ws, {
        type: "error",
        fatal: true,
        message: String(e).includes("SETUP_REDIS") ? "Serwer wymaga pod\u0142\u0105czenia Redis w panelu Vercela. Instrukcja jest w folderze gry." : "Nie mo\u017Cna po\u0142\u0105czy\u0107 si\u0119 z baz\u0105 \u015Bwiata. Sprawd\u017A konfiguracj\u0119 serwera."
      });
      ws.close(1011);
      return;
    }
    const peer = {
      id: "",
      nick: "",
      socket: ws,
      connection: randomUUID(),
      count: 0,
      bytes: 0,
      reset: Date.now(),
      voice: 0,
      joined: false
    };
    this.peers.set(ws, peer);
    const timeout = setTimeout(() => {
      if (!peer.joined) ws.close(1008, "Join required");
    }, 1e4);
    const rotate = setTimeout(() => ws.close(1012, "Reconnect"), 27e4);
    ws.on("message", (raw, isBinary) => {
      if (isBinary) return ws.close(1003);
      const now = Date.now();
      if (now - peer.reset > 1e3) {
        peer.count = 0;
        peer.bytes = 0;
        peer.reset = now;
      }
      peer.count++;
      peer.bytes += raw instanceof ArrayBuffer ? raw.byteLength : Array.isArray(raw) ? raw.reduce((n, b2) => n + b2.length, 0) : raw.length;
      if (peer.count > 65 || peer.bytes > 22e4) return ws.close(1008, "Rate limit");
      let m;
      try {
        m = JSON.parse(raw.toString());
      } catch {
        return ws.close(1007);
      }
      if (!m || typeof m !== "object") return;
      if (m.type === "ping") return this.send(ws, { type: "pong", time: m.time });
      if (m.type === "join") {
        if (m.protocol !== PROTOCOL || !validToken(m.token) || !validNick(m.nick) || !validSkin(m.skin)) {
          this.send(ws, {
            type: "error",
            fatal: true,
            message: "Nieprawid\u0142owy nick, profil lub wersja gry."
          });
          return ws.close(1008);
        }
        const id = createHash("sha256").update(m.token).digest("hex").slice(0, 24);
        if (peer.joined && peer.id !== id) return ws.close(1008);
        peer.id = id;
        peer.nick = m.nick;
        peer.joined = true;
        clearTimeout(timeout);
        this.broadcast({ type: "connection", id, connection: peer.connection });
        this.forward({ type: "join", id, data: { nick: m.nick, skin: m.skin } });
        return;
      }
      if (!peer.joined) return;
      if (m.type === "voice") {
        if (validVoice(m.audio) && now - peer.voice >= 70) {
          peer.voice = now;
          this.broadcast({ type: "voice", id: "*", data: { sender: peer.id, audio: m.audio } });
        }
        return;
      }
      if (m.type === "input") this.forward({ type: "input", id: peer.id, data: m });
      else if (m.type === "chat") this.forward({ type: "chat", id: peer.id, data: m.text });
      else if (m.type === "profile") this.forward({ type: "profile", id: peer.id, data: m.data });
      else if (m.type === "command" && m.command && typeof m.command === "object")
        this.forward({ type: "command", id: peer.id, data: m.command });
    });
    ws.on("close", () => {
      clearTimeout(timeout);
      clearTimeout(rotate);
      this.peers.delete(ws);
      if (peer.id) this.forward({ type: "leave", id: peer.id });
    });
    ws.on("error", () => {
    });
    this.send(ws, { type: "ready" });
  }
  async close() {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    for (const p of this.peers.values()) p.socket.close(1001);
    await this.persist();
    if (this.store) {
      await this.store.eval(RELEASE, { keys: [this.lease], arguments: [this.node] });
      await this.store.close();
    }
    this.room = null;
  }
};
function createGameServer(options = {}) {
  const gateway = new Gateway(options);
  const server2 = createServer((req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        name: "Wsp\xF3lny \u015Bwiat",
        protocol: PROTOCOL,
        configured: !!(process.env.REDIS_URL || options.store || gateway.local),
        players: gateway.room ? [...gateway.room.players.values()].filter((p) => Date.now() - p.seen < 12e3).length : 0,
        voice: true
      })
    );
  });
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 15e4,
    perMessageDeflate: { threshold: 1024 }
  });
  server2.on("upgrade", (req, socket, head) => {
    const origin = req.headers.origin;
    if (origin) {
      try {
        const host = new URL(origin).host;
        if (host !== req.headers.host) {
          socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
          socket.destroy();
          return;
        }
      } catch {
        socket.destroy();
        return;
      }
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      void gateway.accept(ws);
    });
  });
  return { server: server2, gateway, wss };
}

// server/entry.ts
var { server } = createGameServer({
  local: !process.env.VERCEL,
  file: process.env.VERCEL ? void 0 : ".local-world.json"
});
var entry_default = server;
export {
  entry_default as default
};
