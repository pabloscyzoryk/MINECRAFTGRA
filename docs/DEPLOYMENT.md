# Wdrożenie BLOCKLAND na Vercelu

[← Wróć do gry i instrukcji sterowania](../README.md)

Projekt zawiera klienta przeglądarkowego i serwer WebSocket. Do wspólnej gry przez internet potrzebne są **Vercel z Fluid Compute oraz baza Redis**. Gracze otwierają jeden publiczny adres HTTPS; nie instalują niczego i nie otrzymują danych dostępu do bazy.

## Jak działa wspólny świat

Vercel udostępnia stronę oraz funkcję `api/game.js`. Klient łączy się z `/api/game` przez WebSocket. Redis przechowuje bieżący zapis świata i pośredniczy w komunikacji pomiędzy instancjami funkcji. Jedna wybrana instancja prowadzi symulację, a pozostałe przekazują działania graczy.

Zapis świata i większe komunikaty przesyłane przez Redis są kompresowane, aby zmniejszyć zużycie pamięci i transferu. Działania graczy połączonych bezpośrednio z instancją prowadzącą symulację trafiają do niej bez dodatkowego przesyłania przez Redis.

WebSockety są dostępne na Vercelu w wersji beta na wszystkich planach i wymagają Fluid Compute. Połączenie kończy się po osiągnięciu maksymalnego czasu funkcji; klient gry ma mechanizm ponownego łączenia. Szczegóły opisuje [dokumentacja WebSocketów Vercela](https://vercel.com/docs/functions/websockets).

### Trudność i Horror w jednym świecie

Poziomy **Łatwy (`easy`), Średni (`normal`), Trudny (`hard`) i Horror (`horror`)** są wybierane dla postaci. W multiplayer nie wymagają osobnych instancji świata ani różnych wartości `WORLD_NAMESPACE`. Średni jest domyślny; starsze zapisy i profile bez ustawionej trudności również otrzymują `normal`. W grze zmienia się ją przez **Ustawienia → Świat**.

Horror jest dobrowolny. Serwer kieruje wydarzenia Gościa do graczy, którzy wybrali ten poziom; mogą oni uczestniczyć we wspólnych spotkaniach. Pozostali gracze nie widzą Gościa ani nie słyszą jego dźwięków, choć nadal przebywają w tym samym świecie. Historia narasta w trakcie gry i zawiera spokojniejsze przerwy. Zasady walki PvP pozostają wspólne niezależnie od wybranej trudności.

Nie trzeba pobierać dodatkowych zasobów ani ustawiać nowych sekretów: model Gościa, jego efekty dźwiękowe oraz modele trzymanego sprzętu są tworzone przez kod gry i trafiają do zwykłego buildu. Ustawienia dźwięku klienta udostępniają `horrorVolume` oraz `horrorJumpscares`; są oddzielne od wyboru trudności. Wyłączenie nagłych straszeń zachowuje pozostałą atmosferę Horror.

## 1. Zaimportuj repozytorium

1. Dodaj całe repozytorium do projektu Vercel. Katalog główny musi zawierać `package.json`, `vercel.json`, `api/` i `public/`.
2. Ustaw **Framework Preset: Other** i środowisko **Node.js 22.x lub nowsze**.
3. Pozostaw **Fluid Compute włączone**. Nie zmieniaj planu na płatny, aby wykonać poniższe kroki.
4. Konfiguracja kompilacji jest już w `vercel.json`:

| Ustawienie | Wartość |
|---|---|
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `public` |
| Region funkcji | `fra1` — Frankfurt |
| Maksymalny czas funkcji | 300 sekund |

Możesz też wdrażać z katalogu projektu przez Vercel CLI: `npx vercel`, a dla produkcji `npx vercel --prod`. Pierwsze uruchomienie CLI wymaga logowania do Vercela.

## 2. Podłącz Redis

Możesz użyć istniejącej bazy **Redis Cloud Free 30 MB** albo samodzielnie przygotowanego Redis. W przypadku nowej bazy wybierz bezpłatny wariant i sprawdź podsumowanie planu przed utworzeniem. Region możliwie blisko Frankfurtu zmniejsza opóźnienie komunikacji z funkcją gry.

W panelu projektu Vercel przejdź do **Settings → Environment Variables** i dodaj do **Production**:

| Zmienna | Wartość |
|---|---|
| `REDIS_URL` | Prywatny adres klienta Redis, zaczynający się od `redis://` lub `rediss://` |
| `WORLD_NAMESPACE` | `minecraftgra-production-v1` |
| `WORLD_REDIS_MAX_SNAPSHOT_BYTES` | Opcjonalnie `6291456` (domyślne 6 MiB skompresowanego zapisu) |

Adres i hasło skopiuj z ustawień połączenia bazy. Wymagany jest zwykły protokół Redis, **nie adres API REST**. Dla bazy z TLS użyj adresu `rediss://` podanego przez dostawcę. Dane wpisuj wyłącznie w zmiennych serwerowych Vercela; nie dodawaj ich do repozytorium, README ani pliku HTML. Plik [`.env.example`](../.env.example) zawiera tylko nazwy ustawień.

`WORLD_NAMESPACE` przyjmuje litery łacińskie, cyfry, `_` i `-` — maksymalnie 80 znaków. Wszystkie instancje korzystające z tej samej bazy i namespace współdzielą jeden świat.

Jeżeli tej samej bazy używa inny projekt, zachowaj istniejące połączenie i ustaw dla gry **unikalny namespace**, różny także od Preview. Gra odczytuje i zapisuje wyłącznie własne klucze `<namespace>:leader` i `<namespace>:snapshot` oraz korzysta z własnych kanałów `<namespace>:in` i `<namespace>:out`. Nie skanuje bazy, nie wykonuje globalnego czyszczenia ani nie zmienia konfiguracji Redis. Prefiksy rozdzielają dane i komunikaty; pamięć, operacje, połączenia i transfer pozostają wspólne dla wszystkich projektów tej bazy. Każda instancja serwera gry otwiera dwa połączenia Redis.

## 3. Wdróż i dołącz

Po ustawieniu zmiennych wykonaj **Redeploy**. Udostępnij produkcyjny adres HTTPS, dostępny bez logowania do Vercela. W grze wybierz **Tryb wieloosobowy**, ustaw nick i dołącz.

Sprawdź po kolei:

1. Strona i menu się otwierają.
2. Otworzenie `/api/game` pod adresem wdrożenia zwraca JSON. Pole `configured: true` oznacza obecność konfiguracji; samo w sobie nie potwierdza poprawnego połączenia z Redis.
3. Dwóch graczy w różnych przeglądarkach dołącza do tego samego świata i widzi swoje nicki.
4. Blok postawiony przez jedną osobę widzi druga, a zmiana wspólnej skrzyni jest synchronizowana.
5. Działa czat; po wejściu do menu multiplayer przeglądarka prosi o mikrofon, a po udzieleniu zgód i dołączeniu do serwera można sprawdzić rozmowę.

Przy sprawdzaniu nowej wersji wybierz na jednej postaci **Średni**, a na drugiej dobrowolnie **Horror**. Obie powinny pozostać w jednym świecie, a efekty Gościa mają trafiać wyłącznie do postaci Horror. Nie oceniaj działania po samych pierwszych sekundach — spotkania pojawiają się stopniowo. Osobno sprawdź zmianę trudności w trakcie gry i przełącznik nagłych straszeń.

Modele sprzętu sprawdzisz po wybraniu przedmiotu na hotbarze: powinien być widoczny w kamerze F5, podglądzie ekwipunku i u drugiego gracza, podążając za nadgarstkiem. Animacja pierwszoosobowa korzysta z ramienia zakotwiczonego poniżej kadru.

Mikrofon wymaga HTTPS albo localhost. Ustawienie „zawsze włączony” nie omija zgody przeglądarki. Opóźnienie i jakość głosu zależą od sieci oraz zasobów usług.

## Limity bezpłatnego wdrożenia

**Vercel Hobby + Redis Cloud Free służą tu do niewielkiej, osobistej gry i testów.** Limit aplikacji wynosi 16 aktywnych graczy, ale nie oznacza gwarancji płynnej obsługi 16 osób przez bezpłatne usługi.

| Redis Cloud Free — plan 30 MB | Limit |
|---|---:|
| Pamięć bazy | 30 MB |
| Maksymalna przepustowość operacji | 100 operacji/s |
| Łączny transfer miesięczny | 5 GB |
| Jednoczesne połączenia do bazy | 30 |

Są to limity [planu Redis Cloud Essentials Free](https://redis.io/docs/latest/operate/rc/subscriptions/view-essentials-subscription/essentials-plan-details/), sprawdzone we wrześniu 2026 r. Ruch głosowy, kamerki, synchronizacja i rozbudowa świata korzystają z tych zasobów. Połączenia do Redis należą do instancji serwera — nie należy utożsamiać limitu 30 połączeń z liczbą graczy.

Kamerka ma lokalny obraz HD do 30 klatek/s, a przesyłanie JPEG online do 3 klatek/s, z niższym limitem przy wielu graczach. Serwer wysyła obraz tylko do pobliskich postaci w tym samym wymiarze i pomija klatki przy przeciążonym łączu. Klatki przechodzą przez chwilowe komunikaty Pub/Sub; nie są częścią zapisu Redis. Obraz HD zużywa jednak znacznie więcej miesięcznego transferu niż sama gra — wyłączenie kamerki zatrzymuje ten ruch. Aktualizacja nie zmienia bazy, planu usług ani limitów rozliczeń.

Hobby jest przeznaczony do osobistego użytku niekomercyjnego i ma własne limity zużycia. Kontroluj zakładki **Usage** w Vercelu oraz metryki Redis. Przekroczenie limitów może ograniczyć działanie gry; nie ma obietnicy nieograniczonego bezpłatnego hostingu. Sprawdź aktualne [zasady Hobby](https://vercel.com/docs/plans/hobby) i [limity funkcji](https://vercel.com/docs/functions/limitations).

## Zapis i kopie świata

Gra zapisuje wspólny świat w kluczu Redis `<WORLD_NAMESPACE>:snapshot`. Aktualizacja plików gry z zachowaniem tej samej bazy i namespace korzysta z istniejącego zapisu.

Własny zapis gry ma domyślny limit **6 MiB po kompresji**. `WORLD_REDIS_MAX_SNAPSHOT_BYTES` przyjmuje całkowitą liczbę bajtów od `1048576` do `12582912` (1–12 MiB); inne wartości zatrzymują uruchomienie serwera. Obowiązuje także limit 64 MiB JSON po rozpakowaniu, jednakowy przy zapisie i odczycie. Przed przekroczeniem limitu gra zatrzymuje sesje tego świata, odrzuca niepotwierdzone zmiany i zachowuje ostatni poprawny zapis. Nie przycina ekwipunków ani danych świata i nie usuwa danych innych projektów. Administrator powinien sprawdzić wspólny budżet pamięci i kopię zapisu przed zmianą limitu lub ponownym wdrożeniem. Ten limit wyznacza budżet tylko dla zawartości własnego snapshotu — nie gwarantuje osobnego przydziału pamięci czy transferu we współdzielonej bazie.

**Redis Cloud Free nie zapewnia zapisu danych na dysku ani replikacji.** Bieżący świat może przetrwać restart funkcji Vercela, ale awaria lub usunięcie bazy może go utracić. Wynika to z ograniczeń [trwałości danych](https://redis.io/docs/latest/operate/rc/databases/configuration/data-persistence/) i [replikacji](https://redis.io/docs/latest/operate/rc/databases/configuration/high-availability/) bezpłatnego planu. Projekt nie dodaje automatycznej kopii zewnętrznej.

### Ręczna kopia

1. Po zakończeniu sesji połącz się z bazą zaufanym klientem, np. Redis Insight, używając prywatnych danych połączenia.
2. Odczytaj pełną wartość typu String z klucza `minecraftgra-production-v1:snapshot` — albo odpowiedniego klucza dla własnego namespace.
3. Zapisz tę wartość bez zmian jako prywatny plik tekstowy `.txt` poza repozytorium. Skopiuj cały String, a nie skrócony podgląd, i zachowaj datę kopii oraz wersję gry. Nowy zapis zaczyna się od `MINECRAFTGRA:GZIP1:` i zawiera skompresowane dane — nie jest zwykłym JSON-em. Zachowaj prefiks oraz wszystkie znaki. Starsze zapisy JSON również są obsługiwane.

Kopia zawiera profile graczy i stan świata. Nie publikuj jej w publicznym repozytorium.

### Przywrócenie kopii

Przywracaj do **nowego namespace**, aby działająca instancja starego świata nie nadpisała kopii. Utwórz w Redis nowy klucz typu String, np. `minecraftgra-restore-v1:snapshot`, i ustaw jego pełną wartość na zawartość zapisanej kopii, bez modyfikacji ani dodatkowych cudzysłowów. Może to być nowy skompresowany String z prefiksem albo starszy JSON; gra rozpoznaje format automatycznie. Następnie ustaw produkcyjne `WORLD_NAMESPACE=minecraftgra-restore-v1`, wykonaj Redeploy i poproś graczy o ponowne otwarcie strony. Używaj kopii zgodnej z wersją formatu zapisu gry.

Do testowania aktualizacji Preview używaj innego namespace lub osobnej bazy. Preview połączone z produkcyjnym namespace zmienia ten sam świat. Zmiana namespace na nazwę bez istniejącego zapisu uruchamia nowy świat.

## Rozwiązywanie problemów

| Objaw | Co sprawdzić |
|---|---|
| Gra jednoosobowa działa, multiplayer nie | `REDIS_URL` w Production, poprawny protokół i dane połączenia; Redeploy po zmianie zmiennej |
| Wdrożenie wymaga logowania do Vercela | Dostęp do produkcyjnego adresu i ustawienia Deployment Protection |
| Połączenie jest okresowo odnawiane | Funkcja ma ograniczony czas życia; klient ponawia połączenie. Przy ciągłej pętli sprawdź logi funkcji i Redis |
| Drugi gracz dostaje inny świat | Ten sam adres wdrożenia, ta sama baza i `WORLD_NAMESPACE` |
| Utracony profil po powrocie | Ta sama przeglądarka i jej dane strony; nick sam nie przywraca anonimowego klucza |
| Brak mikrofonu lub dźwięku | HTTPS, zgody witryny, włączony mikrofon, tryb nadawania, głośność i aktywna karta |
| Mikrofon nie pyta o zgodę ponownie | Przeglądarka może pamiętać wcześniejszą zgodę lub odmowę; sprawdź uprawnienia mikrofonu dla strony |
| Nie widać twarzy z kamerki | Ustawienia → Mikrofon i kamera, zgoda na kamerę i wybrane urządzenie; użyj przedniego F5. Online wymagany ten sam wymiar i odległość do 60 bloków |
| Znajomy widzi Gościa, a ja nie | To oczekiwane, jeśli tylko znajomy wybrał Horror; trudność jest ustawiana dla każdej postaci |
| Brak nagłych straszeń w Horror | Opcja `horrorJumpscares`, aktywna rozgrywka i stopniowy rozwój spotkań; dźwięki mają osobne `horrorVolume` |
| Powolne działanie lub zerwane sesje | Metryki pamięci, transferu i operacji Redis; limity Vercela; jakość połączenia |

Lokalnie uruchom `npm ci`, `npm run build`, `npm start`. Serwer nasłuchuje na `127.0.0.1:3000` i bez Redis używa pliku `.local-world.json`. Parametr `PORT` pozwala zmienić port. Ten lokalny serwer nasłuchuje wyłącznie na komputerze, na którym jest uruchomiony.
