import { writeFileSync } from "node:fs";
import { BLOCKS } from "../lib/blocks";
import { MINING_RULES, miningDuration, type MiningTool } from "../lib/mining";

const names: Record<MiningTool, string> = {
  hand: "Ręka",
  pickaxe: "Kilof",
  axe: "Siekiera",
  shovel: "Łopata",
  hoe: "Motyka",
  shears: "Nożyce",
  sword: "Miecz",
};
const tiers = ["Dowolne", "Drewniany kilof", "Kamienny kilof", "Żelazny kilof", "Diamentowy kilof"];
const tools = [
  0, 101, 102, 131, 155, 103, 128, 127, 157, 160, 130, 158, 161, 118, 159, 162, 132, 104,
];
const toolNames = [
  "Ręka",
  "Kilof drew.",
  "Kilof kam.",
  "Kilof żel.",
  "Kilof zł.",
  "Kilof diam.",
  "Siekiera drew.",
  "Siekiera żel.",
  "Siekiera zł.",
  "Siekiera diam.",
  "Łopata żel.",
  "Łopata zł.",
  "Łopata diam.",
  "Motyka kam.",
  "Motyka zł.",
  "Motyka diam.",
  "Nożyce",
  "Miecz",
];
const rows = BLOCKS.filter((block) => block.id).map((block) => {
  const rule = MINING_RULES[block.id];
  const drop = rule.unbreakable
    ? "Nie do wydobycia"
    : rule.noDrop
      ? "Brak przedmiotu"
      : rule.leaves
        ? "Liście tylko nożycami"
        : tiers[rule.tier ?? 0];
  const durations = tools.map((id) => {
    const time = miningDuration(block.id, id);
    return !Number.isFinite(time) ? "—" : time === 0 ? "klik" : time.toFixed(2);
  });
  return `| ${block.id} · ${block.name} | ${names[rule.tool]} | ${drop} | ${durations.join(" | ")} |`;
});
writeFileSync(
  new URL("../docs/MINING.md", import.meta.url),
  `# Wydobywanie bloków

Każdy blok ma własną twardość, właściwy rodzaj narzędzia oraz, gdy jest potrzebny, minimalny poziom kilofa. To autorski balans BLOCKLAND, oparty na podziale narzędzi znanym z Minecraft: [tagi narzędzi](https://www.minecraft.net/en-us/article/minecraft-snapshot-21w19a) i [prędkości kopania przypisane do bloków](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/itemreference/examples/itemcomponents/minecraft_digger?view=minecraft-bedrock-stable).

## Najważniejsze zasady

- Kwiaty, trawa i uprawy: pojedynczy klik, również pustą ręką.
- Kilof: kamień, cegły, rudy i minerały. Kolejność rozwoju: drewno → kamień → żelazo → diament. Ruda diamentu wymaga co najmniej żelaznego kilofa, a obsydian diamentowego, żeby otrzymać surowiec.
- Siekiera: drewno, deski, skrzynie, warsztat, biblioteczki i duże grzyby.
- Łopata: ziemia, piasek obu kolorów, żwir, błoto, śnieg oraz uprawna ziemia.
- Motyka: mech i liście. Nożyce dodatkowo zbierają całe liście i bardzo szybko tną wełnę. Miecz przecina bambus jednym kliknięciem.
- Niewłaściwe narzędzie nie daje swojego bonusu. Zbyt słaby kilof może zniszczyć blok, ale nie pozyska wymagającego go surowca. Gra wyświetla wskazówkę przed kopaniem.
- Szkło i lód rozbijają się bez odzyskania bloku. Płynów i portali nie kopie się narzędziami. Fundament na wysokości Y=0 pozostaje nienaruszalny, ale bazalt wyżej jest zwykłą skałą.
- Złote narzędzia mają wysoką prędkość, ale złoty kilof poziom zbierania drewna: nie odzyska m.in. rudy diamentu ani obsydianu. Diamentowy kilof wydobywa również pradawne zgliszcza w Netherze.
- Łuk, tarcza, wiadro, krzesiwo, włócznia i pozostałe przedmioty nie mają bonusu do wydobywania; odpowiada im kolumna „Ręka”. Wszystkie miecze mają tę samą szybkość wydobywania, ale różne obrażenia w walce.
- Zmiana bloku lub trzymanego narzędzia rozpoczyna kopanie od nowa. Pęknięcia pokazują postęp na samym bloku. Kreatywny zachowuje szybkie niszczenie.

Żelazny kilof: trzy sztabki żelaza w górnym rzędzie warsztatu i dwa patyki pod środkiem. Nożyce: dwie sztabki żelaza po przekątnej w siatce 2×2. Oba przedmioty nie łączą się w stosy.

## Pełna tabela

Czasy w sekundach dotyczą ciągłego kopania w przetrwaniu. „Klik” oznacza zniszczenie już przy naciśnięciu przycisku. To czas rozbicia; osobna kolumna określa wymagania uzyskania przedmiotu. Serwer weryfikuje te same reguły. Dane pochodzą bezpośrednio z **lib/mining.ts**; odtworzenie tabeli: **npx tsx scripts/generate-mining-guide.ts**.

| Blok | Właściwe narzędzie | Warunek zebrania | ${toolNames.join(" | ")} |
|---|---|---|${tools.map(() => "---:").join("|")}|
${rows.join("\n")}
`,
);
