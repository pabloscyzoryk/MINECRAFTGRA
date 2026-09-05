# Wydobywanie bloków

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

| Blok | Właściwe narzędzie | Warunek zebrania | Ręka | Kilof drew. | Kilof kam. | Kilof żel. | Kilof zł. | Kilof diam. | Siekiera drew. | Siekiera żel. | Siekiera zł. | Siekiera diam. | Łopata żel. | Łopata zł. | Łopata diam. | Motyka kam. | Motyka zł. | Motyka diam. | Nożyce | Miecz |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 · Trawa | Łopata | Dowolne | 0.90 | 0.90 | 0.90 | 0.90 | 0.90 | 0.90 | 0.90 | 0.90 | 0.90 | 0.90 | 0.15 | 0.10 | 0.15 | 0.90 | 0.90 | 0.90 | 0.90 | 0.90 |
| 2 · Ziemia | Łopata | Dowolne | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 0.15 | 0.10 | 0.10 | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 |
| 3 · Kamień | Kilof | Drewniany kilof | 7.50 | 1.15 | 0.60 | 0.40 | 0.20 | 0.30 | 7.50 | 7.50 | 7.50 | 7.50 | 7.50 | 7.50 | 7.50 | 7.50 | 7.50 | 7.50 | 7.50 | 7.50 |
| 4 · Piasek | Łopata | Dowolne | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 0.15 | 0.10 | 0.10 | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 |
| 5 · Dąb | Siekiera | Dowolne | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 1.50 | 0.50 | 0.25 | 0.40 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 |
| 6 · Liście dębu | Motyka | Liście tylko nożycami | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.10 | 0.05 | 0.05 | 0.05 | 0.20 |
| 7 · Woda | Ręka | Nie do wydobycia | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| 8 · Deski dębowe | Siekiera | Dowolne | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 1.50 | 0.50 | 0.25 | 0.40 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 |
| 9 · Bruk | Kilof | Drewniany kilof | 10.00 | 1.50 | 0.75 | 0.50 | 0.25 | 0.40 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 |
| 10 · Szkło | Ręka | Brak przedmiotu | 0.45 | 0.45 | 0.45 | 0.45 | 0.45 | 0.45 | 0.45 | 0.45 | 0.45 | 0.45 | 0.45 | 0.45 | 0.45 | 0.45 | 0.45 | 0.45 | 0.45 | 0.45 |
| 11 · Cegły | Kilof | Drewniany kilof | 10.00 | 1.50 | 0.75 | 0.50 | 0.25 | 0.40 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 |
| 12 · Obsydian | Kilof | Diamentowy kilof | 250.00 | 125.00 | 62.50 | 41.70 | 20.85 | 9.40 | 250.00 | 250.00 | 250.00 | 250.00 | 250.00 | 250.00 | 250.00 | 250.00 | 250.00 | 250.00 | 250.00 | 250.00 |
| 13 · Portal Netheru | Ręka | Nie do wydobycia | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| 14 · Netherrack | Kilof | Drewniany kilof | 2.00 | 0.30 | 0.15 | 0.10 | 0.05 | 0.10 | 2.00 | 2.00 | 2.00 | 2.00 | 2.00 | 2.00 | 2.00 | 2.00 | 2.00 | 2.00 | 2.00 | 2.00 |
| 15 · Lawa | Ręka | Nie do wydobycia | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| 16 · Jasnogłaz | Ręka | Dowolne | 0.45 | 0.45 | 0.45 | 0.45 | 0.45 | 0.45 | 0.45 | 0.45 | 0.45 | 0.45 | 0.45 | 0.45 | 0.45 | 0.45 | 0.45 | 0.45 | 0.45 | 0.45 |
| 17 · Kamień Endu | Kilof | Drewniany kilof | 15.00 | 2.25 | 1.15 | 0.75 | 0.40 | 0.60 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 |
| 18 · Portal Endu | Ręka | Nie do wydobycia | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| 19 · Śnieg | Łopata | Dowolne | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.05 | 0.05 | 0.05 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 |
| 20 · Ruda węgla | Kilof | Drewniany kilof | 15.00 | 2.25 | 1.15 | 0.75 | 0.40 | 0.60 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 |
| 21 · Ruda żelaza | Kilof | Kamienny kilof | 15.00 | 7.50 | 1.15 | 0.75 | 1.25 | 0.60 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 |
| 22 · Ruda diamentu | Kilof | Żelazny kilof | 15.00 | 7.50 | 3.75 | 0.75 | 1.25 | 0.60 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 |
| 23 · Czerwony grzyb | Siekiera | Dowolne | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.15 | 0.05 | 0.05 | 0.05 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 |
| 24 · Łodyga grzyba | Siekiera | Dowolne | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.15 | 0.05 | 0.05 | 0.05 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 |
| 25 · Świerk | Siekiera | Dowolne | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 1.50 | 0.50 | 0.25 | 0.40 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 |
| 26 · Igliwie | Motyka | Liście tylko nożycami | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.10 | 0.05 | 0.05 | 0.05 | 0.20 |
| 27 · Piaskowiec | Kilof | Drewniany kilof | 4.00 | 0.60 | 0.30 | 0.20 | 0.10 | 0.15 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 |
| 28 · Stół rzemieślniczy | Siekiera | Dowolne | 3.75 | 3.75 | 3.75 | 3.75 | 3.75 | 3.75 | 1.90 | 0.65 | 0.35 | 0.50 | 3.75 | 3.75 | 3.75 | 3.75 | 3.75 | 3.75 | 3.75 | 3.75 |
| 29 · Piec | Kilof | Drewniany kilof | 17.50 | 2.65 | 1.35 | 0.90 | 0.45 | 0.70 | 17.50 | 17.50 | 17.50 | 17.50 | 17.50 | 17.50 | 17.50 | 17.50 | 17.50 | 17.50 | 17.50 | 17.50 |
| 30 · Biblioteczka | Siekiera | Dowolne | 2.25 | 2.25 | 2.25 | 2.25 | 2.25 | 2.25 | 1.15 | 0.40 | 0.20 | 0.30 | 2.25 | 2.25 | 2.25 | 2.25 | 2.25 | 2.25 | 2.25 | 2.25 |
| 31 · Czerwona wełna | Nożyce | Dowolne | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 0.25 | 0.80 |
| 32 · Biała wełna | Nożyce | Dowolne | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 0.25 | 0.80 |
| 33 · Blok złota | Kilof | Żelazny kilof | 15.00 | 7.50 | 3.75 | 0.75 | 1.25 | 0.60 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 |
| 34 · Blok diamentu | Kilof | Żelazny kilof | 25.00 | 12.50 | 6.25 | 1.25 | 2.10 | 0.95 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 |
| 35 · Bazalt | Kilof | Drewniany kilof | 6.25 | 0.95 | 0.50 | 0.35 | 0.20 | 0.25 | 6.25 | 6.25 | 6.25 | 6.25 | 6.25 | 6.25 | 6.25 | 6.25 | 6.25 | 6.25 | 6.25 | 6.25 |
| 36 · Purpur | Kilof | Drewniany kilof | 7.50 | 1.15 | 0.60 | 0.40 | 0.20 | 0.30 | 7.50 | 7.50 | 7.50 | 7.50 | 7.50 | 7.50 | 7.50 | 7.50 | 7.50 | 7.50 | 7.50 | 7.50 |
| 37 · Szmaragd | Kilof | Żelazny kilof | 25.00 | 12.50 | 6.25 | 1.25 | 2.10 | 0.95 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 |
| 38 · Cegły Netheru | Kilof | Drewniany kilof | 10.00 | 1.50 | 0.75 | 0.50 | 0.25 | 0.40 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 |
| 39 · Kwarc | Kilof | Drewniany kilof | 4.00 | 0.60 | 0.30 | 0.20 | 0.10 | 0.15 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 |
| 40 · Mechaty bruk | Kilof | Drewniany kilof | 10.00 | 1.50 | 0.75 | 0.50 | 0.25 | 0.40 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 |
| 41 · Kaktus | Ręka | Dowolne | 0.60 | 0.60 | 0.60 | 0.60 | 0.60 | 0.60 | 0.60 | 0.60 | 0.60 | 0.60 | 0.60 | 0.60 | 0.60 | 0.60 | 0.60 | 0.60 | 0.60 | 0.60 |
| 42 · Żwir | Łopata | Dowolne | 0.90 | 0.90 | 0.90 | 0.90 | 0.90 | 0.90 | 0.90 | 0.90 | 0.90 | 0.90 | 0.15 | 0.10 | 0.15 | 0.90 | 0.90 | 0.90 | 0.90 | 0.90 |
| 43 · Brzoza | Siekiera | Dowolne | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 1.50 | 0.50 | 0.25 | 0.40 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 |
| 44 · Deski brzozowe | Siekiera | Dowolne | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 1.50 | 0.50 | 0.25 | 0.40 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 |
| 45 · Niebieska wełna | Nożyce | Dowolne | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 0.25 | 0.80 |
| 46 · Pomarańczowa wełna | Nożyce | Dowolne | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 | 0.25 | 0.80 |
| 47 · Ciemny dąb | Siekiera | Dowolne | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 1.50 | 0.50 | 0.25 | 0.40 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 |
| 48 · Latarnia | Kilof | Drewniany kilof | 17.50 | 2.65 | 1.35 | 0.90 | 0.45 | 0.70 | 17.50 | 17.50 | 17.50 | 17.50 | 17.50 | 17.50 | 17.50 | 17.50 | 17.50 | 17.50 | 17.50 | 17.50 |
| 49 · Drewno wiśni | Siekiera | Dowolne | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 1.50 | 0.50 | 0.25 | 0.40 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 |
| 50 · Liście wiśni | Motyka | Liście tylko nożycami | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.10 | 0.05 | 0.05 | 0.05 | 0.20 |
| 51 · Deski wiśniowe | Siekiera | Dowolne | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 1.50 | 0.50 | 0.25 | 0.40 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 |
| 52 · Drewno namorzynowe | Siekiera | Dowolne | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 1.50 | 0.50 | 0.25 | 0.40 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 |
| 53 · Liście namorzynu | Motyka | Liście tylko nożycami | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.10 | 0.05 | 0.05 | 0.05 | 0.20 |
| 54 · Błoto | Łopata | Dowolne | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 0.15 | 0.10 | 0.10 | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 |
| 55 · Czerwony piasek | Łopata | Dowolne | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 0.15 | 0.10 | 0.10 | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 |
| 56 · Terakota | Kilof | Drewniany kilof | 6.25 | 0.95 | 0.50 | 0.35 | 0.20 | 0.25 | 6.25 | 6.25 | 6.25 | 6.25 | 6.25 | 6.25 | 6.25 | 6.25 | 6.25 | 6.25 | 6.25 | 6.25 |
| 57 · Biała terakota | Kilof | Drewniany kilof | 6.25 | 0.95 | 0.50 | 0.35 | 0.20 | 0.25 | 6.25 | 6.25 | 6.25 | 6.25 | 6.25 | 6.25 | 6.25 | 6.25 | 6.25 | 6.25 | 6.25 | 6.25 |
| 58 · Ochrowa terakota | Kilof | Drewniany kilof | 6.25 | 0.95 | 0.50 | 0.35 | 0.20 | 0.25 | 6.25 | 6.25 | 6.25 | 6.25 | 6.25 | 6.25 | 6.25 | 6.25 | 6.25 | 6.25 | 6.25 | 6.25 |
| 59 · Bambus | Siekiera | Dowolne | 1.50 | 1.50 | 1.50 | 1.50 | 1.50 | 1.50 | 0.75 | 0.25 | 0.15 | 0.20 | 1.50 | 1.50 | 1.50 | 1.50 | 1.50 | 1.50 | 1.50 | klik |
| 60 · Lód | Kilof | Brak przedmiotu | 0.75 | 0.40 | 0.20 | 0.15 | 0.10 | 0.10 | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 |
| 61 · Skrzynia | Siekiera | Dowolne | 3.75 | 3.75 | 3.75 | 3.75 | 3.75 | 3.75 | 1.90 | 0.65 | 0.35 | 0.50 | 3.75 | 3.75 | 3.75 | 3.75 | 3.75 | 3.75 | 3.75 | 3.75 |
| 62 · Łóżko | Ręka | Dowolne | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 |
| 63 · Uprawna ziemia | Łopata | Dowolne | 0.90 | 0.90 | 0.90 | 0.90 | 0.90 | 0.90 | 0.90 | 0.90 | 0.90 | 0.90 | 0.15 | 0.10 | 0.15 | 0.90 | 0.90 | 0.90 | 0.90 | 0.90 |
| 64 · Kiełkująca pszenica | Ręka | Dowolne | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik |
| 65 · Rosnąca pszenica | Ręka | Dowolne | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik |
| 66 · Dojrzała pszenica | Ręka | Dowolne | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik |
| 67 · Różowe płatki | Ręka | Dowolne | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik |
| 68 · Niebieski kwiat | Ręka | Dowolne | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik |
| 69 · Żółty kwiat | Ręka | Dowolne | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik |
| 70 · Czerwony kwiat | Ręka | Dowolne | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik |
| 71 · Mech | Motyka | Dowolne | 0.15 | 0.15 | 0.15 | 0.15 | 0.15 | 0.15 | 0.15 | 0.15 | 0.15 | 0.15 | 0.15 | 0.15 | 0.15 | 0.05 | 0.05 | 0.05 | 0.15 | 0.15 |
| 72 · Świetlisty grzyb | Ręka | Dowolne | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik |
| 73 · Ametyst | Kilof | Drewniany kilof | 7.50 | 1.15 | 0.60 | 0.40 | 0.20 | 0.30 | 7.50 | 7.50 | 7.50 | 7.50 | 7.50 | 7.50 | 7.50 | 7.50 | 7.50 | 7.50 | 7.50 | 7.50 |
| 74 · Koralowiec | Ręka | Dowolne | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik |
| 75 · Naciek | Kilof | Drewniany kilof | 7.50 | 1.15 | 0.60 | 0.40 | 0.20 | 0.30 | 7.50 | 7.50 | 7.50 | 7.50 | 7.50 | 7.50 | 7.50 | 7.50 | 7.50 | 7.50 | 7.50 | 7.50 |
| 76 · Drewno dżunglowe | Siekiera | Dowolne | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 1.50 | 0.50 | 0.25 | 0.40 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 |
| 77 · Liście dżunglowe | Motyka | Liście tylko nożycami | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.10 | 0.05 | 0.05 | 0.05 | 0.20 |
| 78 · Deski dżunglowe | Siekiera | Dowolne | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 1.50 | 0.50 | 0.25 | 0.40 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 |
| 79 · Wysoka trawa | Ręka | Dowolne | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik | klik |
| 80 · Ruda miedzi | Kilof | Kamienny kilof | 15.00 | 7.50 | 1.15 | 0.75 | 1.25 | 0.60 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 |
| 81 · Blok miedzi | Kilof | Kamienny kilof | 15.00 | 7.50 | 1.15 | 0.75 | 1.25 | 0.60 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 |
| 82 · Głęboka skała | Kilof | Drewniany kilof | 15.00 | 2.25 | 1.15 | 0.75 | 0.40 | 0.60 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 |
| 83 · Rzeźbiony piaskowiec | Kilof | Drewniany kilof | 4.00 | 0.60 | 0.30 | 0.20 | 0.10 | 0.15 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 |
| 84 · Pradawna runa | Kilof | Kamienny kilof | 20.00 | 10.00 | 1.50 | 1.00 | 1.70 | 0.75 | 20.00 | 20.00 | 20.00 | 20.00 | 20.00 | 20.00 | 20.00 | 20.00 | 20.00 | 20.00 | 20.00 | 20.00 |
| 85 · Jasne cegły | Kilof | Drewniany kilof | 10.00 | 1.50 | 0.75 | 0.50 | 0.25 | 0.40 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 |
| 86 · Deski namorzynowe | Siekiera | Dowolne | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 1.50 | 0.50 | 0.25 | 0.40 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 |
| 87 · Ruda złota | Kilof | Żelazny kilof | 15.00 | 7.50 | 3.75 | 0.75 | 1.25 | 0.60 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 |
| 88 · Ruda redstone | Kilof | Żelazny kilof | 15.00 | 7.50 | 3.75 | 0.75 | 1.25 | 0.60 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 |
| 89 · Ruda lapis lazuli | Kilof | Kamienny kilof | 15.00 | 7.50 | 1.15 | 0.75 | 1.25 | 0.60 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 |
| 90 · Ruda szmaragdu | Kilof | Żelazny kilof | 15.00 | 7.50 | 3.75 | 0.75 | 1.25 | 0.60 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 |
| 91 · Ruda kwarcu Netheru | Kilof | Drewniany kilof | 15.00 | 2.25 | 1.15 | 0.75 | 0.40 | 0.60 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 |
| 92 · Pradawne zgliszcza | Kilof | Diamentowy kilof | 150.00 | 75.00 | 37.50 | 25.00 | 12.50 | 5.65 | 150.00 | 150.00 | 150.00 | 150.00 | 150.00 | 150.00 | 150.00 | 150.00 | 150.00 | 150.00 | 150.00 | 150.00 |
| 93 · Ruda złota Netheru | Kilof | Drewniany kilof | 15.00 | 2.25 | 1.15 | 0.75 | 0.40 | 0.60 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 |
| 94 · Blok żelaza | Kilof | Kamienny kilof | 25.00 | 12.50 | 1.90 | 1.25 | 2.10 | 0.95 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 |
| 95 · Blok węgla | Kilof | Drewniany kilof | 25.00 | 3.75 | 1.90 | 1.25 | 0.65 | 0.95 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 |
| 96 · Blok redstone | Kilof | Żelazny kilof | 25.00 | 12.50 | 6.25 | 1.25 | 2.10 | 0.95 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 |
| 97 · Blok lapis lazuli | Kilof | Kamienny kilof | 15.00 | 7.50 | 1.15 | 0.75 | 1.25 | 0.60 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 | 15.00 |
| 98 · Blok kwarcu | Kilof | Drewniany kilof | 4.00 | 0.60 | 0.30 | 0.20 | 0.10 | 0.15 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 |
| 99 · Blok netherytu | Kilof | Diamentowy kilof | 250.00 | 125.00 | 62.50 | 41.70 | 20.85 | 9.40 | 250.00 | 250.00 | 250.00 | 250.00 | 250.00 | 250.00 | 250.00 | 250.00 | 250.00 | 250.00 | 250.00 | 250.00 |
