import { useMemo, useState } from 'react';
import { BodyMap, type MapLevel } from '../components/BodyMap';
import { MUSCLE_LABEL, loggedVolume, planVolume, sortedVolume, startOfWeek, volumeBand, type Muscle, type VolumeBand } from '../muscles';
import type { Plan, Session } from '../types';

interface Props {
  plan: Plan;
  sessions: Session[];
  onBack: () => void;
}

const BANDS: { band: VolumeBand; label: string }[] = [
  { band: 'none', label: '0–4' },
  { band: 'light', label: '5–9' },
  { band: 'medium', label: '10–15' },
  { band: 'strong', label: '16+' },
];

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function Muscles({ plan, sessions, onBack }: Props) {
  const [view, setView] = useState<'logged' | 'plan'>('logged');
  const weekStart = startOfWeek(Date.now());

  const planned = useMemo(() => planVolume(plan), [plan]);
  const logged = useMemo(
    () =>
      loggedVolume(
        sessions.flatMap((s) => s.entries.map((e) => ({ name: e.name, sets: e.sets.length, at: s.finishedAt }))),
        plan,
        weekStart,
      ),
    [sessions, plan, weekStart],
  );

  const shown = view === 'plan' ? planned : logged;
  const levels = Object.fromEntries(Object.entries(shown).map(([m, v]) => [m, volumeBand(v)])) as Record<Muscle, MapLevel>;
  const rows = sortedVolume(shown);
  const top = Math.max(1, ...rows.map(([, v]) => v), ...Object.values(planned));
  const from = new Date(weekStart).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <div className="screen">
      <header className="topbar">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back to home">
          ‹
        </button>
        <div className="topbar-title">
          <span className="topbar-sub">Hard sets per muscle · week from {from}</span>
          <span>Muscles this week</span>
        </div>
      </header>

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={view === 'logged'} className={view === 'logged' ? 'on' : ''} onClick={() => setView('logged')}>
          Logged
        </button>
        <button type="button" role="tab" aria-selected={view === 'plan'} className={view === 'plan' ? 'on' : ''} onClick={() => setView('plan')}>
          Plan
        </button>
      </div>

      <section className="card">
        <BodyMap
          levels={levels}
          detail={(m) => `${fmt(logged[m])} logged · ${fmt(planned[m])} planned`}
          caption={
            <span className="map-key">
              {BANDS.map((b) => (
                <span key={b.band} className="map-key-item">
                  <span className={`key-swatch bm-${b.band}`} /> {b.label}
                </span>
              ))}
              <span className="muted">sets</span>
            </span>
          }
        />
      </section>

      <section className="card">
        <table className="table volume-table">
          <thead>
            <tr>
              <th>Muscle</th>
              <th className="num">Logged</th>
              <th className="num">Plan</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([m]) => (
              <tr key={m}>
                <td>
                  <span className="vol-name">
                    <span className={`key-swatch bm-${volumeBand(shown[m])}`} /> {MUSCLE_LABEL[m]}
                  </span>
                  <span className="vol-bar" aria-hidden="true">
                    <span className={`vol-fill bm-${volumeBand(shown[m])}`} style={{ width: `${(shown[m] / top) * 100}%` }} />
                  </span>
                </td>
                <td className={`num ${view === 'logged' ? 'strong' : ''}`}>{fmt(logged[m])}</td>
                <td className={`num ${view === 'plan' ? 'strong' : ''}`}>{fmt(planned[m])}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small muted">A set counts 1 for a primary muscle and 0.5 for a secondary one. The week starts on Monday.</p>
      </section>
    </div>
  );
}
