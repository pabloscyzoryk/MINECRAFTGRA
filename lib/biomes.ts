export type Biome = {
  id: string;
  name: string;
  color: string;
  description: string;
  resources: string;
  landmark: string;
  surface: number;
  base: number;
  amplitude: number;
  trunk: number;
  leaves: number;
  trees: number;
  flower: number;
  mob: string;
};
export const BIOMES: Biome[] = [
  {
    id: "plains",
    name: "Zielona dolina",
    color: "#a4c37c",
    description: "Łagodne wzgórza, spokojna rzeka i wioska, od której zaczyna się Twoja historia.",
    resources: "Dąb, kamień, pszenica",
    landmark: "Wioska i ruiny strażnicy",
    surface: 1,
    base: 13,
    amplitude: 8,
    trunk: 5,
    leaves: 6,
    trees: 0.025,
    flower: 79,
    mob: "sheep",
  },
  {
    id: "forest",
    name: "Dębowa puszcza",
    color: "#6e965e",
    description: "Gęste korony drzew skrywają ścieżki i omszałe pozostałości dawnych budowli.",
    resources: "Dąb, mech, grzyby",
    landmark: "Omszała strażnica",
    surface: 1,
    base: 14,
    amplitude: 11,
    trunk: 5,
    leaves: 6,
    trees: 0.1,
    flower: 79,
    mob: "fox",
  },
  {
    id: "birch",
    name: "Brzozowy zagajnik",
    color: "#c5d6a2",
    description: "Jasne pnie, delikatne światło i przestrzeń na własny dom.",
    resources: "Brzoza, kwiaty",
    landmark: "Leśna chatka",
    surface: 1,
    base: 15,
    amplitude: 9,
    trunk: 43,
    leaves: 6,
    trees: 0.07,
    flower: 69,
    mob: "bee",
  },
  {
    id: "cherry",
    name: "Wiśniowe wzgórza",
    color: "#edb4cb",
    description: "Różowe korony nad zboczami i płatki niesione przez wiatr.",
    resources: "Wiśnia, różowe deski, płatki",
    landmark: "Pawilon wśród wiśni",
    surface: 1,
    base: 18,
    amplitude: 13,
    trunk: 49,
    leaves: 50,
    trees: 0.095,
    flower: 67,
    mob: "bee",
  },
  {
    id: "taiga",
    name: "Las świerkowy",
    color: "#749893",
    description: "Wysokie świerki, chłodne doliny i lisy na skraju lasu.",
    resources: "Świerk, kamień, węgiel",
    landmark: "Leśna chatka",
    surface: 1,
    base: 17,
    amplitude: 13,
    trunk: 25,
    leaves: 26,
    trees: 0.08,
    flower: 79,
    mob: "fox",
  },
  {
    id: "snow",
    name: "Śnieżne szczyty",
    color: "#d5edf2",
    description: "Ośnieżone grzbiety, lodowe iglice i dalekie, czyste horyzonty.",
    resources: "Śnieg, lód, żelazo",
    landmark: "Zamarznięta strażnica",
    surface: 19,
    base: 25,
    amplitude: 29,
    trunk: 25,
    leaves: 26,
    trees: 0.02,
    flower: 0,
    mob: "sheep",
  },
  {
    id: "desert",
    name: "Złote wydmy",
    color: "#e8cd8b",
    description: "Falujący piasek, samotne kaktusy i skarb we wnętrzu świątyni.",
    resources: "Piasek, piaskowiec, kaktus",
    landmark: "Pustynna piramida",
    surface: 4,
    base: 11,
    amplitude: 15,
    trunk: 0,
    leaves: 0,
    trees: 0.04,
    flower: 0,
    mob: "pig",
  },
  {
    id: "badlands",
    name: "Szkarłatne kaniony",
    color: "#d88a59",
    description: "Tarasy terakoty, czerwony piasek i ostre zbocza nad wąwozami.",
    resources: "Terakota, czerwony piasek, miedź",
    landmark: "Opuszczona kopalnia",
    surface: 55,
    base: 16,
    amplitude: 27,
    trunk: 0,
    leaves: 0,
    trees: 0.015,
    flower: 0,
    mob: "fox",
  },
  {
    id: "jungle",
    name: "Bambusowa dżungla",
    color: "#76a961",
    description: "Wysokie drzewa, bambus i bujna zieleń otaczają zapomnianą świątynię.",
    resources: "Drewno dżunglowe, bambus, mech",
    landmark: "Leśna świątynia",
    surface: 1,
    base: 14,
    amplitude: 18,
    trunk: 76,
    leaves: 77,
    trees: 0.12,
    flower: 59,
    mob: "pig",
  },
  {
    id: "swamp",
    name: "Lasy namorzynowe",
    color: "#8ca58b",
    description: "Korzenie wyrastają z płytkiej wody, a wieczorem pojawiają się świetliki.",
    resources: "Namorzyn, błoto, glina",
    landmark: "Chatka na palach",
    surface: 54,
    base: 10,
    amplitude: 4,
    trunk: 52,
    leaves: 53,
    trees: 0.08,
    flower: 79,
    mob: "frog",
  },
  {
    id: "mushroom",
    name: "Grzybowa dolina",
    color: "#bd9ed3",
    description: "Wielkie kapelusze i świetliste grzyby tworzą niecodzienny krajobraz.",
    resources: "Grzyby, mech, jasnogłaz",
    landmark: "Krąg pradawnych run",
    surface: 71,
    base: 14,
    amplitude: 9,
    trunk: 24,
    leaves: 23,
    trees: 0.08,
    flower: 72,
    mob: "cow",
  },
  {
    id: "flower",
    name: "Kwiecista łąka",
    color: "#d4cf81",
    description: "Kolorowe kwiaty i brzęczenie pszczół na otwartych, słonecznych pagórkach.",
    resources: "Kwiaty, nasiona, brzoza",
    landmark: "Wieża widokowa",
    surface: 1,
    base: 14,
    amplitude: 10,
    trunk: 43,
    leaves: 6,
    trees: 0.025,
    flower: 70,
    mob: "bee",
  },
  {
    id: "crystal",
    name: "Kryształowa kotlina",
    color: "#aa96dc",
    description: "Ametystowe skupiska błyszczą pośród mchu i kamiennych łuków.",
    resources: "Ametyst, mech, głęboka skała",
    landmark: "Kryształowe sanktuarium",
    surface: 71,
    base: 17,
    amplitude: 15,
    trunk: 43,
    leaves: 50,
    trees: 0.018,
    flower: 73,
    mob: "sheep",
  },
  {
    id: "ocean",
    name: "Rafowe wybrzeże",
    color: "#78c6d0",
    description: "Płytka turkusowa woda, koralowce i piaszczyste brzegi pod latarnią.",
    resources: "Koral, piasek, woda",
    landmark: "Nadmorska latarnia",
    surface: 4,
    base: 5,
    amplitude: 7,
    trunk: 0,
    leaves: 0,
    trees: 0,
    flower: 74,
    mob: "frog",
  },
];
export const BIOME_REGION = 96;
function hash(x: number, z: number, seed: number) {
  let n = Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed, 144269);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
const intro: Record<string, string> = {
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
  "2,1": "forest",
};
export function region(cx: number, cz: number, seed: number) {
  const x = Math.round(cx * BIOME_REGION + (hash(cx, cz, seed) - 0.5) * 28),
    z = Math.round(cz * BIOME_REGION + (hash(cx, cz, seed + 13) - 0.5) * 28);
  const id = intro[cx + "," + cz];
  const biome = id
    ? BIOMES.find((b) => b.id === id)!
    : BIOMES[Math.floor(hash(cx, cz, seed + 37) * BIOMES.length) % BIOMES.length];
  return { x, z, biome };
}
export function biomeSample(x: number, z: number, seed: number) {
  const cx = Math.round(x / BIOME_REGION),
    cz = Math.round(z / BIOME_REGION);
  let first = Infinity,
    second = Infinity,
    chosen = BIOMES[0];
  for (let dx = -1; dx <= 1; dx++)
    for (let dz = -1; dz <= 1; dz++) {
      const r = region(cx + dx, cz + dz, seed),
        d = Math.hypot(x - r.x, z - r.z);
      if (d < first) {
        second = first;
        first = d;
        chosen = r.biome;
      } else if (d < second) second = d;
    }
  return {
    biome: chosen,
    blend: Math.max(0, Math.min(1, (second - first) / 26)),
  };
}
export function findBiome(id: string, seed: number, x: number, z: number) {
  const cx = Math.round(x / 96),
    cz = Math.round(z / 96);
  let best: { x: number; z: number; biome: Biome } | null = null,
    dist = Infinity;
  for (let dx = -10; dx <= 10; dx++)
    for (let dz = -10; dz <= 10; dz++) {
      const r = region(cx + dx, cz + dz, seed);
      if (r.biome.id === id) {
        const d = Math.hypot(r.x - x, r.z - z);
        if (d < dist) {
          best = r;
          dist = d;
        }
      }
    }
  return best;
}
