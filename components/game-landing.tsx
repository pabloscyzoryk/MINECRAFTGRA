"use client";
import { memo, useEffect, useRef, useState, type RefObject } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Box,
  Castle,
  Check,
  ChevronDown,
  Compass,
  Flame,
  Layers3,
  Mic,
  Moon,
  Paintbrush,
  Pickaxe,
  Play,
  Shield,
  Sparkles,
  Swords,
  Users,
  Video,
  Volume2,
} from "lucide-react";
import LandingWorldArt from "./landing-world-art";
import { ItemIcon } from "@/lib/item-art";

type Props = {
  ready: boolean;
  saved: boolean;
  scroller: RefObject<HTMLDivElement | null>;
  onPlay: () => void;
  onMultiplayer: () => void;
  onSkin: () => void;
  onSettings: () => void;
  onWorld: () => void;
};
const worlds = [
  {
    id: "overworld",
    name: "Nadziemie",
    tag: "TAM, GDZIE WSZYSTKO SIĘ ZACZYNA",
    title: "Znajdź swoje miejsce.",
    text: "Wiśniowe wzgórza, gęste lasy i spokojne doliny. Wybierz widok z okna, odkryj ukryte struktury i zbuduj miejsce, do którego zechcesz wracać.",
    detail: "14 biomów · zamki · wioski · jaskinie",
    icon: Compass,
  },
  {
    id: "nether",
    name: "Nether",
    tag: "PO DRUGIEJ STRONIE PORTALU",
    title: "Wejdź w sam środek ognia.",
    text: "Napraw obsydianową ruinę i przekrocz portal. Pośród lawy i ciemnych skał czekają nowe surowce, potwory oraz wyprawy, na które warto zabrać przyjaciela.",
    detail: "Lawa · obsydian · niebezpieczne moby",
    icon: Flame,
  },
  {
    id: "end",
    name: "End",
    tag: "PRZYGODA, NA KTÓRĄ SIĘ PRZYGOTUJESZ",
    title: "Spójrz wyzwaniu w oczy.",
    text: "Wyspy zawieszone nad pustką. Kryształy na obsydianowych filarach. I smok, którego pokonanie będzie historią wartą opowiedzenia.",
    detail: "Kryształy · Endermany · walka ze smokiem",
    icon: Swords,
  },
] as const;
const questions = [
  [
    "Czy trzeba coś pobierać?",
    "Nie. Gra uruchamia się w przeglądarce. Wybierz „Wejdź do świata”, a jeśli masz już zapis — kontynuuj swoją przygodę. Do grania potrzebna jest przeglądarka obsługująca WebGL.",
  ],
  [
    "Jak zagrać razem ze znajomymi?",
    "Otwórzcie ten sam adres gry, wybierzcie tryb wieloosobowy i ustawcie swoje nicki. Trafiacie do jednego publicznego świata. Czat otwierasz klawiszem T lub Enter; mikrofon i kamerkę możesz skonfigurować w ustawieniach.",
  ],
  [
    "Czy mój świat się zapisuje?",
    "Świat jednoosobowy zapisuje się lokalnie w tej przeglądarce. W menu pauzy możesz też wyeksportować jego kopię. Świat wieloosobowy jest wspólny i zapisuje się na serwerze.",
  ],
  [
    "Czy mogę grać na telefonie?",
    "Tak — gra ma dotykowy joystick, rozglądanie oraz przyciski akcji. Najwięcej miejsca daje poziomy ekran. Na słabszym urządzeniu zmniejsz zasięg widzenia i wybierz lekkie shadery albo je wyłącz.",
  ],
  [
    "Czy horror jest obowiązkowy?",
    "Nie. Łatwy, średni i trudny to zwykła przygoda. Gość pojawia się wyłącznie po wybraniu poziomu Horror. Głośność jego efektów i nagłe straszenia mają osobne przełączniki.",
  ],
];

function Explorer({
  color,
  cape = false,
  variant = 0,
}: {
  color: string;
  cape?: boolean;
  variant?: number;
}) {
  return (
    <svg viewBox="0 0 112 200" aria-hidden="true" className="lp-explorer">
      {cape && <path d="M24 72H89L102 166H18Z" fill="#c3a3dd" stroke="#493e65" strokeWidth="3" />}
      <path d="M36 128H56V190H35ZM59 128H80V190H59Z" fill={variant === 1 ? "#404e50" : "#30465b"} />
      <path d="M35 180H56V193H31V186ZM59 180H80L84 186V193H59Z" fill="#172827" />
      <path d="M31 74H83V136H31Z" fill={color} />
      <path d="M31 123H83V137H31Z" fill="#ffffff12" />
      <path d="M9 76H29V118H9ZM85 76H105V118H85Z" fill={color} />
      <path d="M9 117H29V145H9ZM85 117H105V145H85Z" fill="#cda782" />
      <path d="M31 74H83V83H31Z" fill="#ffffff14" />
      <path d="M49 72H66V84H49Z" fill="#cda782" />
      <path d="M31 24H83V74H31Z" fill="#d6b38f" />
      <path d="M31 24H83V37H70V33H40V45H31Z" fill={variant === 1 ? "#8e6041" : "#493a2e"} />
      <path d="M38 46H51V53H38ZM64 46H77V53H64Z" fill="#f1eddb" />
      <path d="M44 46H51V53H44ZM64 46H71V53H64Z" fill="#385852" />
      <path d="M51 61H65V67H51Z" fill="#895f48" />
      <path d="M54 54H61V62H54Z" fill="#bf926e" />
      {variant === 2 && (
        <>
          <path d="M29 22H85V38H29Z" fill="#b8d4d4" />
          <path d="M45 22H69V32H45Z" fill="#d9e6e1" />
          <rect x="50" y="26" width="15" height="9" fill="#e9d699" />
        </>
      )}
      <path d="M40 94H51V105H40ZM66 112H75V122H66ZM36 148H44V163H36Z" fill="#ffffff0d" />
    </svg>
  );
}
const MemoWorldArt = memo(LandingWorldArt);

function GameLanding({
  ready,
  saved,
  scroller,
  onPlay,
  onMultiplayer,
  onSkin,
  onSettings,
  onWorld,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [world, setWorld] = useState(0);
  const [shirt, setShirt] = useState("#6a9c87");
  const [cape, setCape] = useState(true);
  const [horrorPreview, setHorrorPreview] = useState(false);
  const current = worlds[world];
  useEffect(() => {
    const node = root.current;
    if (!node || !window.IntersectionObserver) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches) return;
    node.classList.add("lp-motion-ready");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            entry.target.classList.add("lp-visible");
            observer.unobserve(entry.target);
          }
      },
      { root: scroller.current, threshold: 0.08 },
    );
    node.querySelectorAll("[data-reveal]").forEach((el) => observer.observe(el));
    return () => {
      observer.disconnect();
      node.classList.remove("lp-motion-ready");
    };
  }, [scroller]);
  const jump = (id: string) => {
    const target = root.current?.querySelector<HTMLElement>("#" + id);
    target?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "start",
    });
  };
  return (
    <div className="landing-page" ref={root} id="poznaj-blockland">
      <nav className="lp-nav" aria-label="Poznaj grę">
        <button
          className="lp-wordmark"
          onClick={() =>
            scroller.current?.scrollTo({
              top: 0,
              behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
            })
          }
          aria-label="Wróć do menu głównego"
        >
          <Box size={21} /> BLOCKLAND
        </button>
        <div className="lp-nav-links">
          <button onClick={() => jump("lp-worlds")}>Odkrywaj</button>
          <button onClick={() => jump("lp-together")}>Graj razem</button>
          <button onClick={() => jump("lp-style")}>Twój styl</button>
          <button onClick={() => jump("lp-faq")}>Pytania</button>
        </div>
        <button className="lp-nav-play" disabled={!ready} onClick={onPlay}>
          <Play size={13} fill="currentColor" /> Zagraj teraz <ArrowUpRight size={15} />
        </button>
      </nav>

      <section className="lp-intro lp-wrap" aria-labelledby="lp-intro-title">
        <div className="lp-kicker" data-reveal>
          <span className="lp-tiny-cube" /> MAŁY BLOK. WIELKIE MOŻLIWOŚCI.
        </div>
        <div className="lp-intro-grid" data-reveal>
          <h2 id="lp-intro-title">
            Nie szukaj drogi.
            <br />
            <span>Zbuduj własną.</span>
          </h2>
          <div>
            <p>
              Dom na skraju lasu. Wyprawa po pierwszy diament. Wieczór, który ze znajomymi kończycie
              w zupełnie innym wymiarze.
            </p>
            <p className="lp-muted">
              Tutaj nie ma jednej właściwej przygody.
              <br />
              Jest ta, którą stworzysz.
            </p>
          </div>
        </div>
        <div className="lp-facts" data-reveal>
          <div>
            <strong>03</strong>
            <span>wymiary do odkrycia</span>
          </div>
          <div>
            <strong>14</strong>
            <span>biomów pełnych różnic</span>
          </div>
          <div>
            <strong>01</strong>
            <span>wspólny świat online</span>
          </div>
          <div className="lp-fact-note">
            <Box size={24} />
            <span>
              Wszystko zaczyna się
              <br />
              od Twojego pierwszego bloku.
            </span>
          </div>
        </div>
      </section>

      <section className="lp-worlds" id="lp-worlds" aria-labelledby="lp-worlds-title">
        <div className="lp-wrap lp-section-heading" data-reveal>
          <div>
            <div className="lp-kicker">01 / ODKRYWAJ DALEJ</div>
            <h2 id="lp-worlds-title">
              Za każdym portalem
              <br />
              <span>inna historia.</span>
            </h2>
          </div>
          <p>
            Trzy światy. Trzy zupełnie inne emocje.
            <br />
            Sprawdź, dokąd zabierze Cię ciekawość.
          </p>
        </div>
        <div className="lp-wrap" data-reveal>
          <div className="lp-world-tabs" role="tablist" aria-label="Wymiary gry">
            {worlds.map((w, i) => (
              <button
                key={w.id}
                id={"lp-tab-" + w.id}
                role="tab"
                aria-selected={world === i}
                aria-controls="lp-world-panel"
                tabIndex={world === i ? 0 : -1}
                onClick={() => setWorld(i)}
                onKeyDown={(e) => {
                  if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
                    e.preventDefault();
                    const next =
                      e.key === "Home"
                        ? 0
                        : e.key === "End"
                          ? 2
                          : (i + (e.key === "ArrowRight" ? 1 : 2)) % 3;
                    setWorld(next);
                    document.getElementById("lp-tab-" + worlds[next].id)?.focus();
                  }
                }}
              >
                <span>0{i + 1}</span>
                <w.icon size={18} />
                {w.name}
                <ArrowUpRight size={17} />
              </button>
            ))}
          </div>
          <div
            className={"lp-world-stage lp-world-" + current.id}
            id="lp-world-panel"
            role="tabpanel"
            aria-labelledby={"lp-tab-" + current.id}
          >
            <div className="lp-world-orbit" aria-hidden="true" />
            <div className="lp-world-art" key={current.id}>
              <MemoWorldArt world={current.id} />
            </div>
            <div className="lp-world-copy" key={current.name}>
              <span>{current.tag}</span>
              <h3>{current.title}</h3>
              <p>{current.text}</p>
              <div className="lp-world-detail">
                <i />
                {current.detail}
              </div>
            </div>
            <div className="lp-world-coordinate" aria-hidden="true">
              WYMIAR / 0{world + 1}
              <span>∞</span>
            </div>
          </div>
          <div className="lp-castle-teaser" data-reveal>
            <div className="lp-castle-emblem" aria-hidden="true">
              <Castle />
              <i />
              <i />
              <i />
            </div>
            <div>
              <div className="lp-kicker">NIE WSZYSTKIE BRAMY STOJĄ OTWOREM</div>
              <h3>Wielkie mury. Większe wyzwanie.</h3>
              <p>
                Odkryj zamki z wieżami, wielopiętrowymi salami i ukrytymi skarbcami. Omiń patrole
                rycerzy albo zdobądź dziedziniec. Za kolejnym lasem mogą czekać ruiny następnej
                twierdzy.
              </p>
            </div>
            <span className="lp-castle-hint">
              <kbd>J</kbd> Znajdź wyprawę w atlasie
            </span>
          </div>
        </div>
      </section>

      <section className="lp-loop" aria-labelledby="lp-loop-title">
        <div className="lp-wrap">
          <div className="lp-section-heading" data-reveal>
            <div>
              <div className="lp-kicker">02 / ZACZNIJ OD ZERA</div>
              <h2 id="lp-loop-title">
                Puste ręce.
                <br />
                <span>Pełno pomysłów.</span>
              </h2>
            </div>
            <div className="lp-loop-note">
              <Pickaxe size={30} />
              <p>
                Od drewna po diament.
                <br />
                Każda wyprawa daje nowe możliwości.
              </p>
            </div>
          </div>
          <div className="lp-craft-story" data-reveal>
            {[
              {
                n: "01",
                title: "Zbierz",
                text: "Pierwsze drewno, kamień i rudy. Dobierz narzędzie — poczujesz różnicę z każdym uderzeniem.",
                items: [5, 3, 89],
              },
              {
                n: "02",
                title: "Wytwórz",
                text: "Rozpal piec. Ulepsz sprzęt. Zapełnij warsztat narzędziami, które zabiorą Cię o krok dalej.",
                items: [28, 29, 103],
              },
              {
                n: "03",
                title: "Zbuduj",
                text: "Mała chatka czy baza na całe towarzystwo? Dopasuj schody i półbloki, ustaw wygodne łóżko i zamień pomysł w dom.",
                items: [172, 62, 61],
              },
            ].map((step) => (
              <article key={step.n}>
                <div className="lp-craft-items" aria-hidden="true">
                  {step.items.map((id) => (
                    <span key={id}>
                      <ItemIcon id={id} />
                    </span>
                  ))}
                </div>
                <div className="lp-step-title">
                  <span>{step.n}</span>
                  <h3>{step.title}</h3>
                  <ArrowUpRight size={19} />
                </div>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
          <div className="lp-mode-strip" data-reveal>
            <span>
              <Shield size={16} /> Przetrwanie — zasłuż na każdy blok.
            </span>
            <span>
              <Sparkles size={16} /> Kreatywny — daj wyobraźni wolną rękę.
            </span>
            <button onClick={onWorld}>
              Wybierz swój tryb <ArrowRight size={17} />
            </button>
          </div>
        </div>
      </section>

      <section className="lp-together lp-wrap" id="lp-together" aria-labelledby="lp-together-title">
        <div
          className="lp-party-art"
          data-reveal
          role="img"
          aria-label="Ilustracja trzech graczy wspólnie planujących przygodę"
        >
          <div className="lp-party-grid" />
          <div className="lp-party-orbit" />
          <div className="lp-party-label">
            <i />
            <Users size={14} /> MIEJSCE NA WASZĄ HISTORIĘ
          </div>
          <div className="lp-party-person lp-person-one">
            <span>
              Ja szukam diamentów. <Pickaxe size={12} />
            </span>
            <Explorer color="#749781" />
            <small>ODKRYWCA</small>
          </div>
          <div className="lp-party-person lp-person-two">
            <span>
              To ja buduję bazę! <Box size={12} />
            </span>
            <Explorer color="#b9865e" cape variant={1} />
            <small>BUDOWNICZA</small>
          </div>
          <div className="lp-party-person lp-person-three">
            <span>
              Kto idzie do Endu? <ArrowUpRight size={12} />
            </span>
            <Explorer color="#648997" variant={2} />
            <small>POSZUKIWACZ</small>
          </div>
          <div className="lp-voice-preview">
            <Mic size={17} />
            <div aria-hidden="true">
              {Array.from({ length: 15 }, (_, i) => (
                <i
                  key={i}
                  style={{
                    height: [7, 15, 24, 11, 28, 19, 9][i % 7],
                    animationDelay: i * -0.11 + "s",
                  }}
                />
              ))}
            </div>
            <span>Najlepiej razem.</span>
          </div>
        </div>
        <div className="lp-party-copy" data-reveal>
          <div className="lp-kicker">03 / ZAPROŚ SWOICH LUDZI</div>
          <h2 id="lp-together-title">
            Dobry świat.
            <br />
            <span>Jeszcze lepsza ekipa.</span>
          </h2>
          <p>
            Podzielcie się zadaniami, ruszcie na wyprawę albo sprawdźcie się w PvP. Jeden link
            wystarczy, by spotkać się w tym samym publicznym świecie.
          </p>
          <ul>
            <li>
              <Mic size={19} />
              <div>
                <b>Rozmawiajcie po drodze</b>
                <span>Czat tekstowy i głos w grze. Wasze plany bez wychodzenia z przygody.</span>
              </div>
            </li>
            <li>
              <Video size={19} />
              <div>
                <b>Pokaż swoją reakcję</b>
                <span>
                  Włącz kamerkę, a jej obraz pojawi się na twarzy postaci. Tak, inni też go zobaczą.
                </span>
              </div>
            </li>
            <li>
              <Swords size={19} />
              <div>
                <b>Ramię w ramię. Albo w pojedynku.</b>
                <span>Wspólne budowanie, potwory i walka PvP z różnymi broniami oraz tarczą.</span>
              </div>
            </li>
          </ul>
          <button className="lp-button" onClick={onMultiplayer} disabled={!ready}>
            Wejdźcie do wspólnego świata <ArrowUpRight size={18} />
          </button>
        </div>
      </section>

      <section className="lp-personal" id="lp-style" aria-labelledby="lp-style-title">
        <div className="lp-wrap lp-personal-grid">
          <div data-reveal>
            <div className="lp-kicker">04 / ZRÓB TO PO SWOJEMU</div>
            <h2 id="lp-style-title">
              Twój charakter.
              <br />
              <span>W każdym pikselu.</span>
            </h2>
            <p>
              Własna skórka, druga warstwa ubrania i peleryna. Maluj bezpośrednio na modelu 3D,
              korzystaj z gotowych skórek albo zacznij od czystego płótna.
            </p>
            <div className="lp-style-features">
              <span>
                <Paintbrush size={17} /> Edytor 3D
              </span>
              <span>
                <Layers3 size={17} /> Dwie warstwy
              </span>
              <span>
                <ArrowDown size={17} /> Import i eksport PNG
              </span>
            </div>
            <button className="lp-text-button" onClick={onSkin}>
              Stwórz swoją postać <ArrowUpRight size={19} />
            </button>
            <div className="lp-settings-note">
              <Sparkles size={18} />
              <p>
                A świat? Też po Twojemu.
                <br />
                <button onClick={onSettings}>
                  Shadery, dźwięki i sterowanie w ustawieniach <ArrowRight size={14} />
                </button>
              </p>
            </div>
          </div>
          <div className="lp-style-preview" data-reveal>
            <span className="lp-style-caption">MAŁA PRZYMIERZALNIA</span>
            <div className="lp-style-rings" />
            <div className="lp-style-avatar">
              <Explorer color={shirt} cape={cape} />
            </div>
            <div className="lp-style-palette" role="group" aria-label="Podgląd koloru koszulki">
              {[
                { color: "#6a9c87", name: "Leśna zieleń" },
                { color: "#638fac", name: "Błękit" },
                { color: "#bd9165", name: "Miodowy" },
                { color: "#a080b8", name: "Wrzos" },
                { color: "#b97068", name: "Ceglany" },
              ].map((c) => (
                <button
                  key={c.color}
                  aria-label={c.name}
                  aria-pressed={shirt === c.color}
                  onClick={() => setShirt(c.color)}
                  style={{ background: c.color }}
                >
                  {shirt === c.color && <Check size={17} />}
                </button>
              ))}
            </div>
            <button className="lp-cape-toggle" aria-pressed={cape} onClick={() => setCape(!cape)}>
              <span>{cape && <Check size={12} />}</span> Peleryna
            </button>
            <small>Przymierz kolor. Swoją skórkę zapiszesz w edytorze.</small>
          </div>
        </div>
      </section>

      <section
        className={"lp-horror" + (horrorPreview ? " lp-horror-awake" : "")}
        aria-labelledby="lp-horror-title"
      >
        <div className="lp-horror-lines" aria-hidden="true" />
        <div className="lp-horror-eyes" aria-hidden="true">
          <i />
          <i />
        </div>
        <div className="lp-wrap lp-horror-inner" data-reveal>
          <span className="lp-horror-tag">
            <Moon size={13} /> TYLKO DLA TYCH, KTÓRZY WYBIORĄ HORROR
          </span>
          <h2 id="lp-horror-title">
            Nie każdy cień
            <br />
            jest <em>twój.</em>
          </h2>
          <p>
            Najpierw czujesz, że ktoś patrzy.
            <br />
            Potem zaczynasz dostrzegać Gościa.
            <br />
            Wreszcie rozumiesz, dlaczego warto uciekać.
          </p>
          <div className="lp-horror-actions">
            <button
              className="lp-horror-button"
              aria-pressed={horrorPreview}
              onClick={() => setHorrorPreview(!horrorPreview)}
            >
              <Moon size={16} />
              {horrorPreview ? "Wystarczy na razie" : "Spójrz w ciemność"}
              <ArrowRight size={17} />
            </button>
            <button className="lp-text-button" onClick={onWorld}>
              Wybierz poziom trudności <ArrowUpRight size={16} />
            </button>
          </div>
          <small>
            <Volume2 size={13} /> W grze: narastające napięcie, krzyk i jumpscare. Horror wybierasz
            samodzielnie.
          </small>
        </div>
      </section>

      <section className="lp-faq lp-wrap" id="lp-faq" aria-labelledby="lp-faq-title">
        <div data-reveal>
          <div className="lp-kicker">ZANIM POSTAWISZ PIERWSZY BLOK</div>
          <h2 id="lp-faq-title">Dobrze wiedzieć.</h2>
          <p>
            Jeszcze tylko kilka rzeczy.
            <br />
            Potem świat jest Twój.
          </p>
          <div className="lp-browser-stamp">
            <Box size={25} />
            <span>
              Bez instalacji.
              <br />
              <b>Prosto do przygody.</b>
            </span>
          </div>
        </div>
        <div className="lp-faq-list" data-reveal>
          {questions.map(([q, a], i) => (
            <details key={q}>
              <summary>
                <span>0{i + 1}</span>
                {q}
                <ChevronDown size={18} />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="lp-final">
        <div className="lp-wrap" data-reveal>
          <div className="lp-kicker">
            <span /> TWÓJ NASTĘPNY WIECZÓR MOŻE WYGLĄDAĆ INACZEJ
          </div>
          <h2>
            Wszystko jest jeszcze
            <br />
            <em>do zbudowania.</em>
          </h2>
          <div className="lp-final-actions">
            <button className="lp-button" disabled={!ready} onClick={onPlay}>
              <Play size={18} fill="currentColor" />
              {saved ? "Wróć do swojego świata" : "Postaw pierwszy blok"}
              <ArrowUpRight size={20} />
            </button>
            <button className="lp-text-button" disabled={!ready} onClick={onMultiplayer}>
              Zagraj ze znajomymi <Users size={18} />
            </button>
          </div>
          <p>Przeglądarka. Odrobina ciekawości. I Ty.</p>
        </div>
        <Box className="lp-final-cube" size={340} strokeWidth={0.4} aria-hidden="true" />
      </section>
      <footer className="lp-footer lp-wrap">
        <div className="lp-wordmark">
          <Box size={20} /> BLOCKLAND
        </div>
        <p>
          Niezależna gra voxelowa w przeglądarce.
          <br />
          Projekt fanowski, niezwiązany z Mojang ani Microsoft.
        </p>
        <button
          className="lp-back-top"
          onClick={() =>
            scroller.current?.scrollTo({
              top: 0,
              behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
                ? "instant"
                : "smooth",
            })
          }
        >
          Wróć na górę <ArrowUpRight size={17} />
        </button>
      </footer>
    </div>
  );
}
export default memo(GameLanding);
