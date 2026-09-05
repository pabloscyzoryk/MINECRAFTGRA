'use client';
import { useState, type CSSProperties } from 'react';
import {
  Compass,
  Check,
  MapPin,
  ArrowUpRight,
  Trophy,
  PackageOpen,
  Shield,
  Leaf,
} from 'lucide-react';
import { BIOMES } from '@/lib/biomes';
import { item } from '@/lib/blocks';
import type { Game, Snapshot } from '@/lib/engine';
export function Journal({ game, snap }: { game: Game; snap: Snapshot }) {
  const [tab, setTab] = useState<'atlas' | 'quests'>('atlas');
  const data = snap.adventure;
  return (
    <div className="journal">
      <div className="journal-summary">
        <div>
          <Compass />
          <b>
            {data.discovered.length}
            <small> / {BIOMES.length} biomów</small>
          </b>
        </div>
        <div>
          <Trophy />
          <b>
            {data.awards.length}
            <small> / 8 osiągnięć</small>
          </b>
        </div>
        <div>
          <PackageOpen />
          <b>
            {data.opened}
            <small> skrzyń</small>
          </b>
        </div>
      </div>
      <div className="journal-tabs">
        <button
          className={tab === 'atlas' ? 'active' : ''}
          onClick={() => setTab('atlas')}
        >
          Atlas świata
        </button>
        <button
          className={tab === 'quests' ? 'active' : ''}
          onClick={() => setTab('quests')}
        >
          Twoja przygoda
        </button>
      </div>
      {tab === 'atlas' ? (
        <>
          <p className="journal-intro">
            Wybierz kierunek. Każdy biom ma własny charakter, surowce i miejsce,
            które warto odnaleźć.
          </p>
          <div className="biome-catalog">
            {BIOMES.map((b, i) => {
              const seen = data.discovered.includes(b.id);
              return (
                <article
                  className="biome-card"
                  key={b.id}
                  style={{ '--biome': b.color } as CSSProperties}
                >
                  <div className="biome-art">
                    <span className="biome-number">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <i />
                    <i />
                    <i />
                    {seen && (
                      <span className="discovered">
                        <Check size={12} />
                        Odkryto
                      </span>
                    )}
                  </div>
                  <div className="biome-copy">
                    <h3>{b.name}</h3>
                    <p>{b.description}</p>
                    <small>
                      <Leaf size={12} />
                      {b.resources}
                    </small>
                    <small>
                      <MapPin size={12} />
                      {b.landmark}
                    </small>
                    <div className="biome-actions">
                      <button onClick={() => game.adventure.locate(b.id)}>
                        <Compass size={14} />
                        Nawiguj
                      </button>
                      {snap.mode === 'creative' && (
                        <button
                          onClick={() => game.adventure.locate(b.id, true)}
                          title="Przenieś gracza do biomu"
                        >
                          <ArrowUpRight size={15} />
                          Odwiedź
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          <p className="panel-footnote">
            Pod powierzchnią: bujne jaskinie, groty ametystowe i jaskinie
            naciekowe. Szukaj rud, świecących grzybów i przejść w skałach.
          </p>
        </>
      ) : (
        <div className="quest-list">
          {data.quests.map((q) => {
            const done = data.awards.includes(q.id);
            return (
              <article key={q.id} className={done ? 'complete' : ''}>
                <div className="quest-icon">
                  {done ? <Check /> : <Trophy />}
                </div>
                <div>
                  <h3>{q.name}</h3>
                  <p>{q.description}</p>
                  <div className="quest-progress">
                    <i
                      style={{
                        width: Math.min(100, (q.value / q.target) * 100) + '%',
                      }}
                    />
                  </div>
                  <small>
                    {Math.min(q.target, q.value)} / {q.target}
                  </small>
                </div>
                <b>+{q.reward} PD</b>
              </article>
            );
          })}
        </div>
      )}
      {data.waypoint && (
        <div className="journal-waypoint">
          <Compass size={18} />
          <span>
            Cel: <b>{data.waypoint.name}</b> · {data.waypoint.distance} m
          </span>
          <button
            onClick={() => {
              game.adventure.clearWaypoint();
            }}
          >
            Usuń cel
          </button>
        </div>
      )}
    </div>
  );
}
export function ChestPanel({ game, snap }: { game: Game; snap: Snapshot }) {
  const storage = snap.adventure.chest;
  const grid = (contents: Record<number, number>, toChest: boolean) => (
    <div className="chest-items">
      {Object.entries(contents)
        .filter(([, n]) => n > 0)
        .map(([key, n]) => {
          const id = Number(key),
            b = item(id);
          return (
            <button
              key={id}
              onClick={() => game.adventure.transfer(id, toChest)}
              title={(toChest ? 'Włóż: ' : 'Zabierz: ') + b.name}
            >
              <span
                className="chest-item-cube"
                style={{ background: b.color }}
              />
              <b>{b.name}</b>
              <small>×{n}</small>
            </button>
          );
        })}
      {!Object.values(contents).some((n) => n > 0) && (
        <p className="chest-empty">Tutaj jest jeszcze pusto.</p>
      )}
    </div>
  );
  return (
    <div className="chest-panel">
      <div className="chest-heading">
        <h3>
          <PackageOpen size={19} />
          Zawartość skrzyni
        </h3>
        <button onClick={() => game.adventure.takeAll()}>
          Zabierz wszystko
        </button>
      </div>
      {grid(storage, false)}
      <h3>
        <Shield size={18} />
        Twój ekwipunek
      </h3>
      {grid(snap.inventory, true)}
      <p className="panel-footnote">
        Kliknij przedmiot, aby przenieść cały stos. Każda skrzynia zachowuje
        własną zawartość w zapisie świata.
      </p>
    </div>
  );
}
