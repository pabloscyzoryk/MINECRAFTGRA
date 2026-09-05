import { SHAPES } from "./block-shapes";
export type Dimension = "overworld" | "nether" | "end";
export type Mode = "survival" | "creative";
export type Block = {
  id: number;
  name: string;
  color: string;
  top?: string;
  solid?: boolean;
  transparent?: boolean;
  glow?: boolean;
  hardness?: number;
  category: string;
  plant?: boolean;
};
const b = (
  id: number,
  name: string,
  color: string,
  category = "Natura",
  extra: Partial<Block> = {},
): Block => ({
  id,
  name,
  color,
  category,
  solid: true,
  hardness: 0.7,
  ...extra,
});
export const BLOCKS: Block[] = [
  b(0, "Powietrze", "#ffffff", "", { solid: false }),
  b(1, "Trawa", "#87603c", "Natura", { top: "#79a548" }),
  b(2, "Ziemia", "#856043"),
  b(3, "Kamień", "#858c91"),
  b(4, "Piasek", "#dbc48a"),
  b(5, "Dąb", "#715336", "Drewno", { top: "#b09160" }),
  b(6, "Liście dębu", "#4e853a", "Natura"),
  b(7, "Woda", "#479fab", "Natura", { solid: false, transparent: true }),
  b(8, "Deski dębowe", "#b28b53", "Drewno"),
  b(9, "Bruk", "#7c8284", "Budowanie"),
  b(10, "Szkło", "#bee4e5", "Budowanie", { transparent: true }),
  b(11, "Cegły", "#a25a44", "Budowanie"),
  b(12, "Obsydian", "#272237", "Wymiary", { hardness: 3 }),
  b(13, "Portal Netheru", "#9e42e1", "Wymiary", {
    solid: false,
    transparent: true,
    glow: true,
  }),
  b(14, "Netherrack", "#80443f", "Wymiary"),
  b(15, "Lawa", "#fa7627", "Wymiary", { solid: false, glow: true }),
  b(16, "Jasnogłaz", "#e8c568", "Wymiary", { glow: true }),
  b(17, "Kamień Endu", "#c9c798", "Wymiary"),
  b(18, "Portal Endu", "#163e43", "Wymiary", { solid: false, glow: true }),
  b(19, "Śnieg", "#e2eaf1"),
  b(20, "Ruda węgla", "#747b80", "Rudy"),
  b(21, "Ruda żelaza", "#96908a", "Rudy"),
  b(22, "Ruda diamentu", "#73aaa4", "Rudy"),
  b(23, "Czerwony grzyb", "#bf4e43"),
  b(24, "Łodyga grzyba", "#d3cbb4"),
  b(25, "Świerk", "#534636", "Drewno", { top: "#8b7654" }),
  b(26, "Igliwie", "#386b50"),
  b(27, "Piaskowiec", "#c4ad7b", "Budowanie"),
  b(28, "Stół rzemieślniczy", "#a27145", "Budowanie", { top: "#765231" }),
  b(29, "Piec", "#575e61", "Budowanie"),
  b(30, "Biblioteczka", "#a67d4d", "Budowanie"),
  b(31, "Czerwona wełna", "#b34a48", "Budowanie"),
  b(32, "Biała wełna", "#e3ded4", "Budowanie"),
  b(33, "Blok złota", "#e5b84e", "Rudy"),
  b(34, "Blok diamentu", "#68c8c0", "Rudy"),
  b(35, "Bazalt", "#45404a", "Wymiary"),
  b(36, "Purpur", "#99779e", "Wymiary"),
  b(37, "Szmaragd", "#42b474", "Rudy"),
  b(38, "Cegły Netheru", "#472c35", "Wymiary"),
  b(39, "Kwarc", "#e3d5c7", "Budowanie"),
  b(40, "Mechaty bruk", "#718068", "Budowanie"),
  b(41, "Kaktus", "#5d8242"),
  b(42, "Żwir", "#979085"),
  b(43, "Brzoza", "#d8d3bd", "Drewno"),
  b(44, "Deski brzozowe", "#d5be82", "Drewno"),
  b(45, "Niebieska wełna", "#4e6da4", "Budowanie"),
  b(46, "Pomarańczowa wełna", "#d28a43", "Budowanie"),
  b(47, "Ciemny dąb", "#4e3d2d", "Drewno"),
  b(48, "Latarnia", "#ffd279", "Budowanie", { glow: true }),
  b(49, "Drewno wiśni", "#78514e", "Drewno", { top: "#d9a7a3" }),
  b(50, "Liście wiśni", "#e3a4bd"),
  b(51, "Deski wiśniowe", "#d8a0a6", "Drewno"),
  b(52, "Drewno namorzynowe", "#67403a", "Drewno"),
  b(53, "Liście namorzynu", "#73905a"),
  b(54, "Błoto", "#5c635c"),
  b(55, "Czerwony piasek", "#c77d49"),
  b(56, "Terakota", "#b67755", "Budowanie"),
  b(57, "Biała terakota", "#d6bfa7", "Budowanie"),
  b(58, "Ochrowa terakota", "#ce9e50", "Budowanie"),
  b(59, "Bambus", "#92ae51", "Natura", { plant: true, solid: false }),
  b(60, "Lód", "#b6dfe9", "Natura", { transparent: true }),
  b(61, "Skrzynia", "#aa793f", "Budowanie"),
  b(62, "Łóżko", "#bd6360", "Budowanie"),
  b(63, "Uprawna ziemia", "#62492f", "Natura"),
  b(64, "Kiełkująca pszenica", "#7fa251", "Uprawy", {
    plant: true,
    solid: false,
  }),
  b(65, "Rosnąca pszenica", "#a8b351", "Uprawy", { plant: true, solid: false }),
  b(66, "Dojrzała pszenica", "#d5b766", "Uprawy", {
    plant: true,
    solid: false,
  }),
  b(67, "Różowe płatki", "#f0b5ca", "Natura", { plant: true, solid: false }),
  b(68, "Niebieski kwiat", "#7eabdc", "Natura", { plant: true, solid: false }),
  b(69, "Żółty kwiat", "#e4c864", "Natura", { plant: true, solid: false }),
  b(70, "Czerwony kwiat", "#d87770", "Natura", { plant: true, solid: false }),
  b(71, "Mech", "#829c53"),
  b(72, "Świetlisty grzyb", "#9ecee3", "Natura", {
    plant: true,
    solid: false,
    glow: true,
  }),
  b(73, "Ametyst", "#a597da", "Rudy", { glow: true }),
  b(74, "Koralowiec", "#e1a2b6", "Natura", { plant: true, solid: false }),
  b(75, "Naciek", "#aa8d6e"),
  b(76, "Drewno dżunglowe", "#836140", "Drewno"),
  b(77, "Liście dżunglowe", "#507847"),
  b(78, "Deski dżunglowe", "#ac805a", "Drewno"),
  b(79, "Wysoka trawa", "#8ba75b", "Natura", { plant: true, solid: false }),
  b(80, "Ruda miedzi", "#858b79", "Rudy"),
  b(81, "Blok miedzi", "#c38c66", "Rudy"),
  b(82, "Głęboka skała", "#465663"),
  b(83, "Rzeźbiony piaskowiec", "#c7ac7d", "Budowanie"),
  b(84, "Pradawna runa", "#84baba", "Budowanie", { glow: true }),
  b(85, "Jasne cegły", "#c2c3b6", "Budowanie"),
  b(86, "Deski namorzynowe", "#9d655a", "Drewno"),
  b(87, "Ruda złota", "#858789", "Rudy"),
  b(88, "Ruda redstone", "#717879", "Rudy", { glow: true }),
  b(89, "Ruda lapis lazuli", "#848b93", "Rudy"),
  b(90, "Ruda szmaragdu", "#838d86", "Rudy"),
  b(91, "Ruda kwarcu Netheru", "#80443f", "Rudy"),
  b(92, "Pradawne zgliszcza", "#654a42", "Rudy"),
  b(93, "Ruda złota Netheru", "#88473b", "Rudy"),
  b(94, "Blok żelaza", "#cbd3d3", "Rudy"),
  b(95, "Blok węgla", "#30343a", "Rudy"),
  b(96, "Blok redstone", "#b52e32", "Rudy", { glow: true }),
  b(97, "Blok lapis lazuli", "#3158a8", "Rudy"),
  b(98, "Blok kwarcu", "#eadfd4", "Budowanie"),
  b(99, "Blok netherytu", "#4c4244", "Rudy"),
];
// Numeric lookup intentionally leaves item IDs 100–169 unoccupied.
for (const [key, shape] of Object.entries(SHAPES)) {
  const id = Number(key);
  if (id === 62 || id === 41) continue;
  const name =
    shape.kind === "bed"
      ? "Łóżko"
      : shape.kind === "stairs"
        ? `Schody ${shape.base === 8 ? "dębowe" : "kamienne"}`
        : `${shape.kind === "double-slab" ? "Podwójny półblok" : "Półblok"} ${shape.base === 8 ? "dębowy" : "kamienny"}`;
  BLOCKS[id] = b(id, name, BLOCKS[shape.base].color, "Budowanie");
}
export const ITEMS = [
  { id: 133, name: "Sztabka złota", color: "#e7ba4c", category: "Surowce" },
  { id: 134, name: "Pył redstone", color: "#d34740", category: "Surowce" },
  { id: 135, name: "Lapis lazuli", color: "#4574cd", category: "Surowce" },
  { id: 136, name: "Szmaragd", color: "#44bf86", category: "Surowce" },
  { id: 137, name: "Kwarc Netheru", color: "#efdfda", category: "Surowce" },
  { id: 138, name: "Odłamek netherytu", color: "#806355", category: "Surowce" },
  { id: 139, name: "Sztabka netherytu", color: "#564d4c", category: "Surowce" },
  { id: 140, name: "Skóra", color: "#ad744d", category: "Surowce" },
  { id: 141, name: "Skórzana czapka", color: "#b38359", category: "Pancerz" },
  { id: 142, name: "Skórzana tunika", color: "#b38359", category: "Pancerz" },
  { id: 143, name: "Skórzane spodnie", color: "#b38359", category: "Pancerz" },
  { id: 144, name: "Skórzane buty", color: "#b38359", category: "Pancerz" },
  { id: 145, name: "Złoty hełm", color: "#edc75e", category: "Pancerz" },
  { id: 146, name: "Złoty napierśnik", color: "#edc75e", category: "Pancerz" },
  { id: 147, name: "Złote nogawice", color: "#edc75e", category: "Pancerz" },
  { id: 148, name: "Złote buty", color: "#edc75e", category: "Pancerz" },
  { id: 149, name: "Żelazny hełm", color: "#c9d5d6", category: "Pancerz" },
  { id: 150, name: "Żelazne nogawice", color: "#c9d5d6", category: "Pancerz" },
  { id: 151, name: "Żelazne buty", color: "#c9d5d6", category: "Pancerz" },
  { id: 152, name: "Diamentowy hełm", color: "#7adace", category: "Pancerz" },
  { id: 153, name: "Diamentowe nogawice", color: "#7adace", category: "Pancerz" },
  { id: 154, name: "Diamentowe buty", color: "#7adace", category: "Pancerz" },
  { id: 155, name: "Złoty kilof", color: "#edc75e", category: "Narzędzia" },
  { id: 156, name: "Złoty miecz", color: "#edc75e", category: "Narzędzia" },
  { id: 157, name: "Złota siekiera", color: "#edc75e", category: "Narzędzia" },
  { id: 158, name: "Złota łopata", color: "#edc75e", category: "Narzędzia" },
  { id: 159, name: "Złota motyka", color: "#edc75e", category: "Narzędzia" },
  { id: 160, name: "Diamentowa siekiera", color: "#7adace", category: "Narzędzia" },
  { id: 161, name: "Diamentowa łopata", color: "#7adace", category: "Narzędzia" },
  { id: 162, name: "Diamentowa motyka", color: "#7adace", category: "Narzędzia" },
  { id: 131, name: "Żelazny kilof", color: "#beced2", category: "Narzędzia" },
  { id: 132, name: "Nożyce", color: "#ccd5d5", category: "Narzędzia" },
  { id: 126, name: "Tarcza", color: "#b1c5c9", category: "Pancerz" },
  { id: 127, name: "Żelazna siekiera", color: "#c5d3d4", category: "Narzędzia" },
  { id: 128, name: "Drewniana siekiera", color: "#b68e54", category: "Narzędzia" },
  { id: 129, name: "Włócznia", color: "#bfcbd3", category: "Narzędzia" },
  { id: 130, name: "Żelazna łopata", color: "#beced2", category: "Narzędzia" },
  { id: 123, name: "Krzesiwo", color: "#9baab0", category: "Narzędzia" },
  { id: 124, name: "Krzemień", color: "#515865", category: "Surowce" },
  { id: 101, name: "Drewniany kilof", color: "#bb9568", category: "Narzędzia" },
  { id: 102, name: "Kamienny kilof", color: "#acb3b6", category: "Narzędzia" },
  {
    id: 103,
    name: "Diamentowy kilof",
    color: "#67e5d2",
    category: "Narzędzia",
  },
  { id: 104, name: "Żelazny miecz", color: "#d4e2e4", category: "Narzędzia" },
  { id: 105, name: "Łuk", color: "#c09863", category: "Narzędzia" },
  { id: 106, name: "Jabłko", color: "#e97b57", category: "Jedzenie" },
  { id: 107, name: "Chleb", color: "#d7a55a", category: "Jedzenie" },
  {
    id: 108,
    name: "Diamentowy miecz",
    color: "#6de2d3",
    category: "Narzędzia",
  },
  { id: 109, name: "Węgiel", color: "#55565a", category: "Surowce" },
  { id: 110, name: "Żelazo", color: "#bec1bf", category: "Surowce" },
  { id: 111, name: "Diament", color: "#5ce1d6", category: "Surowce" },
  { id: 112, name: "Patyk", color: "#a78453", category: "Surowce" },
  { id: 113, name: "Strzały", color: "#c7bd9c", category: "Surowce" },
  { id: 114, name: "Wiaderko", color: "#c5ced0", category: "Narzędzia" },
  { id: 115, name: "Wiadro wody", color: "#63c7e7", category: "Narzędzia" },
  { id: 116, name: "Nasiona pszenicy", color: "#a5bf79", category: "Uprawy" },
  { id: 117, name: "Pszenica", color: "#d7ba72", category: "Uprawy" },
  { id: 118, name: "Motyka", color: "#9aa59b", category: "Narzędzia" },
  { id: 119, name: "Pradawny relikt", color: "#b5d7c9", category: "Skarby" },
  { id: 120, name: "Sztabka miedzi", color: "#ce9876", category: "Surowce" },
  {
    id: 121,
    name: "Żelazny napierśnik",
    color: "#c9d5d6",
    category: "Pancerz",
  },
  {
    id: 122,
    name: "Diamentowy napierśnik",
    color: "#7adace",
    category: "Pancerz",
  },
];
export const item = (id: number) => BLOCKS[id] ?? ITEMS.find((x) => x.id === id) ?? BLOCKS[0];
export type Recipe = { out: number; n: number; need: [number, number][] };
export const RECIPES: Recipe[] = [
  { out: 170, n: 6, need: [[8, 3]] },
  { out: 172, n: 4, need: [[8, 6]] },
  { out: 180, n: 6, need: [[3, 3]] },
  { out: 182, n: 4, need: [[3, 6]] },
  {
    out: 131,
    n: 1,
    need: [
      [110, 3],
      [112, 2],
    ],
  },
  { out: 132, n: 1, need: [[110, 2]] },
  ...[44, 51, 78, 86].flatMap((wood): Recipe[] => [
    { out: 112, n: 4, need: [[wood, 2]] },
    { out: 28, n: 1, need: [[wood, 4]] },
    { out: 61, n: 1, need: [[wood, 8]] },
    {
      out: 101,
      n: 1,
      need: [
        [wood, 3],
        [112, 2],
      ],
    },
    {
      out: 62,
      n: 1,
      need: [
        [wood, 3],
        [32, 3],
      ],
    },
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
      [32, 3],
    ],
  },
  {
    out: 118,
    n: 1,
    need: [
      [9, 2],
      [112, 2],
    ],
  },
  { out: 107, n: 2, need: [[117, 3]] },
  {
    out: 120,
    n: 1,
    need: [
      [80, 1],
      [109, 1],
    ],
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
      [112, 2],
    ],
  },
  {
    out: 102,
    n: 1,
    need: [
      [9, 3],
      [112, 2],
    ],
  },
  { out: 29, n: 1, need: [[9, 8]] },
  {
    out: 110,
    n: 1,
    need: [
      [21, 1],
      [109, 1],
    ],
  },
  {
    out: 104,
    n: 1,
    need: [
      [110, 2],
      [112, 1],
    ],
  },
  {
    out: 103,
    n: 1,
    need: [
      [111, 3],
      [112, 2],
    ],
  },
  {
    out: 108,
    n: 1,
    need: [
      [111, 2],
      [112, 1],
    ],
  },
  {
    out: 105,
    n: 1,
    need: [
      [112, 6],
      [110, 1],
    ],
  },
  {
    out: 113,
    n: 16,
    need: [
      [112, 2],
      [9, 2],
    ],
  },
  {
    out: 10,
    n: 8,
    need: [
      [4, 8],
      [109, 1],
    ],
  },
  {
    out: 11,
    n: 8,
    need: [
      [2, 8],
      [109, 1],
    ],
  },
  {
    out: 48,
    n: 4,
    need: [
      [109, 1],
      [112, 4],
    ],
  },
  {
    out: 13,
    n: 4,
    need: [
      [12, 6],
      [16, 2],
    ],
  },
  {
    out: 18,
    n: 4,
    need: [
      [17, 6],
      [111, 2],
    ],
  },
  { out: 34, n: 1, need: [[111, 9]] },
];
export const DIMENSIONS = {
  overworld: {
    name: "Nadziemie",
    subtitle: "Lasy, góry i nowe początki",
    color: "#b7df91",
  },
  nether: {
    name: "Nether",
    subtitle: "Po drugiej stronie ognia",
    color: "#ee9b6a",
  },
  end: { name: "End", subtitle: "Tam czeka smok", color: "#c5a7ec" },
};
