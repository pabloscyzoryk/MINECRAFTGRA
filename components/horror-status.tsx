import type { HuntWire } from "@/lib/horror-hunt";

const hints: Record<HuntWire["phase"], [string, string]> = {
  telegraph: ["Coś zna Twoje kroki", "Masz chwilę, żeby się oddalić. Nie czekaj na twarz."],
  stalk: ["Gość poluje", "Zyskaj dystans. Zerwij linię wzroku za przeszkodą."],
  lungeTell: ["Wstrzymał oddech", "Zejdź z jego drogi. Zaraz skoczy."],
  lunge: ["Unik!", "Uciekaj w bok."],
  vulnerable: ["Teraz jest odsłonięty", "Krótka chwila na kontratak — albo na ucieczkę."],
  caught: ["Gość Cię schwytał", "Twoja postać umiera."],
  escaped: ["Znów cisza", "Udało Ci się zgubić Gościa."],
  banished: ["Gość pokonany", "Ciemność ustąpiła. Możesz odetchnąć."],
};
export default function HorrorStatus({ threat, localId }: { threat: HuntWire; localId: string }) {
  const [title, hint] =
    threat.phase === "caught" && threat.targetId !== localId
      ? ["Gość schwytał towarzysza", "Oddal się od miejsca ataku."]
      : hints[threat.phase];
  return (
    <aside className={`horror-status phase-${threat.phase}`} aria-label="Polowanie Gościa">
      <span>HORROR / GOŚĆ</span>
      <b>{title}</b>
      <p>{hint}</p>
      {threat.hp < threat.maxHp && threat.hp > 0 && (
        <div
          className="guest-health"
          role="meter"
          aria-label="Wytrzymałość Gościa"
          aria-valuemin={0}
          aria-valuemax={threat.maxHp}
          aria-valuenow={threat.hp}
        >
          <i style={{ width: `${(100 * threat.hp) / threat.maxHp}%` }} />
        </div>
      )}
    </aside>
  );
}
