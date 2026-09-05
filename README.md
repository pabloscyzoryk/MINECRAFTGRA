<p align="center">
  <img src="docs/banner.svg" alt="BLOCKLAND — buduj, odkrywaj i graj razem w przeglądarce" width="100%" />
</p>

# MINECRAFTGRA · BLOCKLAND

**Blokowy świat do odkrywania, budowania i wspólnej gry — bez instalowania klienta.** Gra 3D w przeglądarce z trybem przetrwania, craftingiem, trzema wymiarami, smokiem, edytorem postaci i multiplayerem. Na komputerze sterujesz myszą i klawiaturą, a na telefonie przyciskami dotykowymi.

### [▶ Zagraj teraz — minecraftgra.vercel.app](https://minecraftgra.vercel.app)

Wybierz **Tryb wieloosobowy**, wpisz nick i zaproś znajomych pod ten sam adres. Publiczne wdrożenie korzysta z **Vercel Hobby** i istniejącej bazy **Redis Cloud Free 30 MB**. Zmiany wysłane do gałęzi `main` są automatycznie wdrażane.

[Pierwsze kroki](#pierwsze-kroki) · [Trudność i Horror](#poziom-trudności-i-horror) · [Sterowanie](#sterowanie) · [Multiplayer i rozmowy](#multiplayer-i-rozmowy) · [Uruchomienie lokalne](#uruchomienie-lokalne) · [Wdrożenie na Vercelu](docs/DEPLOYMENT.md)

## Co znajdziesz w grze

| Odkrywaj | Buduj | Graj razem |
|---|---|---|
| Proceduralne biomy, jaskinie i struktury | Wydobywanie surowców i różne rodzaje narzędzi | Jeden publiczny świat i własne nicki |
| Nadziemie, Nether i End ze smokiem | Crafting 2 × 2 oraz stół 3 × 3 | Wspólne budowanie i skrzynie |
| Animowane moby, pogoda i cykl dnia | Plecak, hotbar i skrzynie z osobnymi polami | PvP, tarcze, łuki i wytrzymałość |
| Woda, pływanie i podwodny widok | Edytor skórek z dwiema warstwami i peleryną | Czat tekstowy oraz rozmowy przez mikrofon |

Pięć stylów shaderów oraz opcja **Wyłączone** (bez efektów postprocessingu i cieni), ustawienia światła, zasięgu widzenia, dźwięków i muzyki pozwalają dopasować grę do sprzętu. Kamera ma widok z pierwszej osoby, zza pleców i z przodu. Edytor skórki jest domyślnie otwarty po prawej stronie menu: wybierz gotową skórkę albo narysuj własną, obracając model przy wciśniętym środkowym przycisku myszy.

Broń, podstawowe narzędzia, tarcza, łuk i bloki mają modele 3D widoczne przy nadgarstku także po naciśnięciu **F5**, u innych graczy oraz w podglądzie ekwipunku. Sprzęt podąża za animacją ręki. W pierwszej osobie ramię jest zakotwiczone poniżej kadru, a uderzenie prowadzi dłoń w przód i w dół. Domyślna skórka ma rękawy na górze ramion i odsłoniętą szyję; własnoręcznie edytowane skórki pozostają zachowane.

## Pierwsze kroki

1. Wybierz **Tryb i trudność**, a następnie tryb przetrwania lub dołącz do świata wieloosobowego. Nowa postać zaczyna z pustym ekwipunkiem.
2. Przytrzymaj LPM na drewnie, zbierz surowiec i otwórz ekwipunek klawiszem **E**. Postępujące pęknięcia bloku pokazują pracę narzędzia.
3. Zajrzyj do **Księgi receptur**. Przygotuj deski, a następnie stół rzemieślniczy z czterech desek. Własna siatka ma 2 × 2 pola; użycie postawionego stołu otwiera siatkę 3 × 3.
4. Wytwórz narzędzia, przygotuj schronienie i skrzynię. Kilof przyspiesza kopanie kamienia, siekiera drewna, a łopata ziemi, piasku i żwiru.
5. Otwórz **Atlas** klawiszem **J** i odkrywaj świat. Ruiny portali wymagają przygotowania, zanim zabiorą Cię do kolejnego wymiaru.

**Kontynuuj zapisany świat** odtwarza wcześniejszy ekwipunek. Puste pola dotyczą nowej postaci i odrodzenia. W trybie kreatywnym przedmioty wybierasz z katalogu dostępnego w ekwipunku. Puste pole na pasku podręcznym oznacza pustą rękę.

## Poziom trudności i Horror

Wybierz trudność podczas tworzenia świata lub dołączania do multiplayer. W trakcie gry możesz ją zmienić w **Ustawienia → Świat**.

| Poziom | Rozgrywka |
|---|---|
| **Łatwy** (`easy`) | Łagodniejsze obrażenia od otoczenia, wolniejszy głód i szybsza regeneracja |
| **Średni** (`normal`) | Domyślne przetrwanie: zbieranie zapasów, budowanie i eksploracja |
| **Trudny** (`hard`) | Mocniejsze zagrożenia, szybszy głód i wolniejszy powrót do zdrowia |
| **Horror** (`horror`) | Wymagające przetrwanie z narastającą historią spotkań z Gościem |

**Średni jest ustawieniem domyślnym**, także dla starych światów i profili bez zapisanego poziomu trudności. W multiplayer trudność dotyczy **Twojej postaci**. Nadal wszyscy gracie w jednym publicznym świecie; wybór poziomu nie tworzy oddzielnego serwera, a zasady PvP pozostają równe.

### Gość — tylko dla chętnych

Horror włączasz samodzielnie, wybierając ten poziom. Autorska postać **Gościa** buduje napięcie stopniowo: nie od razu zobaczysz wszystko, a po mocniejszych spotkaniach przychodzą spokojniejsze chwile. Historia rozwija się podczas rozgrywki, więc daj jej czas i obserwuj otoczenie. Model postaci i dźwięki powstają proceduralnie — gra nie wymaga instalacji dodatkowych modeli ani paczek audio.

**Gracze na Łatwym, Średnim i Trudnym nie widzą Gościa ani nie słyszą jego dźwięków.** Osoby, które wybrały Horror, mogą przeżywać wspólne spotkania. Możecie jednocześnie budować i rozmawiać z graczami, którzy pozostali przy zwykłym przetrwaniu.

W **Ustawienia → Dźwięk** są osobne opcje **Gość — dźwięki horroru** (`horrorVolume`) i **Nagłe straszenia w trybie Horror** (`horrorJumpscares`). Możesz zmniejszyć głośność lub wyłączyć nagłe straszenia, zachowując odległe spotkania i atmosferę. Przełączenie trudności z Horror na inny poziom wyłącza udział Twojej postaci w tych zdarzeniach.

## Sterowanie

| Klawisz / przycisk | Działanie |
|---|---|
| **W A S D** + mysz | Ruch i rozglądanie |
| **Spacja** | Skok / pływanie w górę |
| **2× W** lub lewy **Ctrl** | Sprint |
| **Shift** | Kucanie |
| **LPM** | Kopanie / atak |
| **PPM** | Postawienie bloku / użycie / osłona tarczą |
| **1–9** lub kółko myszy | Wybór pola podręcznego |
| **E** | Ekwipunek |
| **J / M / H** | Atlas / wymiary / pomoc |
| **Q / Ctrl + Q** | Wyrzuć jedną sztukę / cały stos |
| **R** | Jedzenie |
| **F** | Przełącz latanie w trybie kreatywnym |
| **F5** | Pierwsza osoba → zza pleców → z przodu |
| **Enter / T** | Czat tekstowy |
| **V** | Domyślny klawisz mikrofonu |
| **Escape** | Zamknij panel / menu pauzy |

Klawisze możesz zmienić w ustawieniach. **E, J, M i H ponownie zamykają swój panel**, jeśli nie wpisujesz tekstu w polu wyszukiwania. Po powrocie gra przejmuje kursor; gdy przeglądarka wymaga dodatkowego kliknięcia, użyj **Wróć do sterowania** albo kliknij w świat.

### Ekwipunek, crafting, skrzynie i piec

Plecak ma **27 pól**, hotbar **9**, a każda skrzynia **27**. Przedmioty można kłaść w dowolnych polach; skrzynia pokazuje liczbę wolnych miejsc.

| Gest | Działanie |
|---|---|
| Przeciągnij stos | Przenieś go między polami, plecakiem, skrzynią lub siatką craftingu |
| Kliknij stos, potem pole | Podnieś i odłóż; ten sposób również działa |
| **Podwójny LPM** na przedmiocie | Zbierz pasujące przedmioty do stosu trzymanego kursorem |
| **PPM** | Podnieś połowę stosu albo odłóż jedną sztukę |
| Trzymany stos + przeciąganie **LPM / PPM** | Rozdziel równo / odłóż po jednej sztuce w odwiedzonych polach |
| **Shift + wynik craftingu** | Wytwórz serię do limitu stosu i dostępnego miejsca |
| **Shift + klik** | Szybko przenieś stos między obszarami ekwipunku lub między plecakiem a skrzynią |

Dwuklik zbiera najwyżej **jeden pełny stos**: zwykle 64 sztuki, dla wybranych przedmiotów 16, a dla narzędzi i wyposażenia po 1. Nadmiar zostaje w polach. Upuszczenie przeciąganego stosu poza oknem nie wyrzuca przedmiotów. W multiplayer zmiany wspólnej skrzyni zatwierdza serwer, więc dwie osoby nie mogą zabrać tej samej zawartości.

Piec ma osobne pola na surowiec, paliwo i wynik. **Shift + klik** wkłada surowiec lub paliwo do odpowiedniego pola; z pieca przenosi stos do plecaka. Płomień pokazuje zapas paliwa, strzałka postęp przetapiania. Węgiel wystarcza na osiem operacji; można też palić drewnem, deskami lub patykami. Piec pracuje po zamknięciu okna, gdy gracz pozostaje w pobliżu. Nie produkuje przedmiotów podczas nieobecności wszystkich graczy.

[Zasady gestów i źródła badania zachowania Minecraft Java](docs/INVENTORY-RESEARCH.md).

### Granie na telefonie

Lewy joystick porusza postacią, a przeciąganie po wolnej części świata obraca kamerę. Mocne wychylenie joysticka do przodu włącza sprint. Po prawej są przyciski ataku, budowania, skoku i kucania; hotbar wybierasz dotknięciem.

W ekwipunku **przytrzymaj stos przez krótką chwilę i przeciągnij**, również w pionie. Szybkie przesunięcie palca w pionie przewija panel. Możesz też dotknąć stosu i pola docelowego. Przy krawędzi okna przeciągany przedmiot uruchamia przewijanie.

Układ obsługuje pion i poziom; poziomo pozostaje więcej miejsca na świat. Na słabszym urządzeniu zmniejsz zasięg, rozdzielczość i cienie w ustawieniach. Rzeczywista płynność zależy od urządzenia.

## Multiplayer i rozmowy

Wybierz **Tryb wieloosobowy**, wpisz nick i kliknij **Dołącz do świata**. Wszyscy korzystający z tego samego wdrożenia trafiają do wspólnego świata. Serwer ma limit **16 aktywnych graczy**; dostępna wydajność zależy również od hostingu.

Nick przyjmuje 3–20 liter, cyfr oraz znaków `_` i `-`. Postać jest związana z anonimowym kluczem zapisanym w przeglądarce. Powrót z tej samej przeglądarki przywraca profil, o ile istnieje zapis serwera. Sam nick nie jest kontem ani hasłem. Wyczyszczenie danych strony tworzy nowy profil. Tryb jednoosobowy ma oddzielny zapis lokalny.

**Enter lub T** otwiera czat tekstowy; Enter wysyła wiadomość, a Escape wraca do gry. Na telefonie użyj przycisku czatu.

Mikrofon włączasz świadomie przyciskiem w panelu **Gracze i rozmowa**, po udzieleniu zgody przeglądarki. Do wyboru są:

- **Przytrzymywanie** — nadawanie podczas trzymania klawisza lub przycisku ekranowego.
- **Przełączanie kliknięciem** — kolejne naciśnięcia włączają i wyłączają nadawanie.
- **Zawsze włączony** — nadawanie po włączeniu mikrofonu, kiedy karta jest widoczna i połączona.

Możesz zmienić klawisz rozmowy i głośność. Pisanie na czacie nie uruchamia skrótu mikrofonu. Ukrycie karty przerywa nadawanie, a wyjście z multiplayer wyłącza mikrofon. Rozmowę słyszą gracze na serwerze również w innych wymiarach; dźwięk jest przesyłany na żywo i nie jest zapisywany w świecie. Mikrofon wymaga **HTTPS lub localhost**.

### Walka i PvP

Bezpieczny obszar startowy obejmuje promień 12 bloków wokół X 8, Z 22 w Nadziemiu. Nowa postać i odrodzenie dostają **8 sekund ochrony**. Dalej zaczyna się PvP: ataki zużywają wytrzymałość, mają różny zasięg i czas odnowienia, a trafienie może odrzucić przeciwnika.

Miecz pozwala uderzać szybciej, żelazna siekiera uderza mocniej i przełamuje osłonę, włócznia dosięga dalej, a łuk zużywa strzały. Tarcza blokuje ataki od przodu, pancerz zmniejsza obrażenia, a skok z przewagą wysokości pozwala trafić krytycznie. Po śmierci wyposażenie wypada na ziemię, a gracz odradza się z pustymi polami.

## Uruchomienie lokalne

Wymagany **Node.js 22.13 lub nowszy**. W katalogu projektu uruchom:

```sh
npm ci
npm run build
npm start
```

Otwórz [localhost:3000](http://localhost:3000). Lokalny serwer może działać bez Redis; zapisuje świat w `.local-world.json`. Do sprawdzenia dwóch graczy użyj dwóch przeglądarek lub okna zwykłego i prywatnego. Gotowy `public/index.html` można też otworzyć bez serwera do gry jednoosobowej.

**Chcesz grać przez internet?** Wdróż cały projekt według [instrukcji Vercel + Redis](docs/DEPLOYMENT.md). Sam plik HTML nie uruchamia wspólnego serwera. Konfiguracja może korzystać z Vercel Hobby i Redis Cloud Free, ale obowiązują limity transferu, pamięci i obliczeń. Bezpłatny Redis nie zapewnia trwałości danych po awarii bazy — [wykonuj prywatne kopie świata](docs/DEPLOYMENT.md#zapis-i-kopie-świata).

## Kod i sprawdzanie zmian

```sh
npm run check
npm run lint
npm test
npm run build
```

Testy obejmują m.in. ekwipunek i crafting, gesty przenoszenia, wodę, sterowanie, animacje, zakotwiczenie ręki i mocowanie sprzętu, bezpieczne uaktualnienie domyślnej skórki, poziomy trudności, filtrowanie wydarzeń Horror, walkę, synchronizację skrzyń, ponowne łączenie oraz połączenia WebSocket dwóch klientów. Testy logiki nie zastępują ręcznej rozgrywki na konkretnym telefonie ani odsłuchu rozmowy z rzeczywistych mikrofonów.

| Katalog / plik | Zawartość |
|---|---|
| `app/`, `components/`, `hooks/` | Menu, ekwipunek, edytor postaci i sterowanie |
| `lib/` | Świat, renderowanie, rozgrywka i klient multiplayer |
| `server/` | Wspólna symulacja, WebSockety i zapis Redis |
| `public/index.html` | Zbudowany klient z osadzonymi zasobami |
| `api/game.js` | Zbudowany serwer dla Vercela |
| `tests/` | Testy automatyczne |
| `docs/DEPLOYMENT.md` | Wdrożenie, limity i kopie świata |

BLOCKLAND jest niezależną grą inspirowaną blokowymi sandboksami, nie jest oficjalnym Minecraftem i nie łączy się z jego serwerami. Multiplayer sprawdza działania i przedmioty po stronie serwera, lecz ruch jest przewidywany przez klienta — nie jest to system ochrony turniejowej przed oszustwami.
