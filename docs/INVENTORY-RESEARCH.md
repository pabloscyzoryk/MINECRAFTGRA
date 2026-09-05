# Sterowanie ekwipunkiem — badanie i specyfikacja

Sprawdzono 5 września 2026. Celem jest zachowanie gestów znane z Minecraft Java: plecak, pasek podręczny, skrzynia, siatka wytwarzania i piec. Na telefonach te same operacje korzystają z dotyku. To własna implementacja gry; lista przedmiotów i receptur nie jest pełną kopią Minecraft.

## Zasady i źródła

| Gest | Zachowanie w grze | Podstawa |
|---|---|---|
| LPM | Podnosi stos pod kursor; następny klik odkłada, łączy lub zamienia stos. | [Oficjalny poradnik sterowania](https://www.minecraft.net/en-us/article/minecraft-controls) |
| PPM | Podnosi większą połowę stosu albo odkłada jedną sztukę. | [Zgłoszenie MC-2034 w trackerze Mojang](https://bugs-legacy.mojang.com/browse/MC-2034) opisuje dzielenie na pół; [dokumentacja autorów AE2](https://guide.appliedenergistics.org/1.20.6/items-blocks-machines/terminals) potwierdza standardowe podnoszenie i odkładanie. |
| Dwuklik LPM | Zbiera pasujące przedmioty z otwartego ekranu do stosu przy kursorze, do limitu danego przedmiotu. | [VPT, NeurIPS 2022, suplement, tabela 3](https://papers.nips.cc/paper_files/paper/2022/file/9c7008aff45b5d8f0973b23e1a22ada0-Supplemental-Conference.pdf), [InventoryTweaks — Modern Minecraft Changes](https://modrinth.com/mod/inventorytweaks) |
| Trzymany stos + przeciąganie LPM | Rozdziela stos równomiernie między zaznaczone puste lub pasujące pola; reszta zostaje przy kursorze. | [InventoryTweaks — opis odtworzenia współczesnej mechaniki](https://modrinth.com/mod/inventorytweaks) |
| Trzymany stos + przeciąganie PPM | Odkłada po jednej sztuce na każde odwiedzone pole. Powrót nad to samo pole nie dokłada kolejnej sztuki w tym samym geście. | [InventoryTweaks — różnica między standardowym gestem a MouseTweaks](https://modrinth.com/mod/inventorytweaks) |
| Shift + klik | Przenosi stos między otwartym pojemnikiem i plecakiem; bez pojemnika między plecakiem i paskiem. Najpierw uzupełnia pasujące stosy. | [Oficjalne skróty Minecraft Java](https://help.minecraft.net/hc/en-us/articles/360059148111-Minecraft-Java-Edition-Hotkeys), [NeoForge — menu i quickMoveStack](https://docs.neoforged.net/docs/1.21.11/inventories/menus/) |
| Shift + wynik craftingu | Wytwarza serię do limitu stosu i dostępnego miejsca, pobierając składniki. | [Oficjalne skróty Minecraft Java](https://help.minecraft.net/hc/en-us/articles/360059148111-Minecraft-Java-Edition-Hotkeys) |
| Piec | Osobne pola surowca, paliwa i wyniku; postęp przetapiania; różna wydajność paliwa. | [Minecraft — Block of the Week: Furnace](https://www.minecraft.net/de-de/article/block-week-furnace) |

Źródła mają różny zakres: Mojang potwierdza podstawowe klawisze, pojemniki i przetapianie; suplement badania opisuje operacje wykonywane w środowisku Minecraft; autor moda dokumentuje odtworzenie gestów i wyraźnie oddziela dodatki. Nie traktujemy dodatkowych gestów moda jako zasad oryginalnej gry. Dokumentacja NeoForge uzasadnia rozdzielenie danych pojemnika od widoku i potwierdzanie zmian przez serwer.

## Różnice wynikające z przeglądarki

- Bezpośrednie przeciągnięcie stosu ze źródła do celu jest dodatkowo dostępne obok podniesienia kliknięciem. Anulowanie lub upuszczenie poza panelem nie usuwa przedmiotów.
- Na dotyku przytrzymanie rozpoczyna przeciąganie; szybki ruch pionowy przewija panel. PPM pozostaje skrótem myszy.
- Podczas przeciągania widoczny jest podgląd rozdziału. W multiplayer serwer zatwierdza jeden kompletny gest i rozstrzyga równoczesny dostęp do skrzyni lub pieca.
- W tej grze piec przetapia żelazo, miedź, piasek i bruk, używa węgla, drewna, desek lub patyków. Nie symuluje czasu nieobecności graczy na serwerze.

## Kontrola poprawności

Testy sprawdzają zachowanie sumy przedmiotów, limitów stosów, pełnych pól, niepasujących przedmiotów, podwójnych żądań i starego stanu pojemnika. Osobno sprawdzane są pobieranie wyniku, zużycie paliwa, postęp pieca i zapis świata. Ocena wyglądu i sterowania odbywa się w Chrome na zbudowanej wersji.
