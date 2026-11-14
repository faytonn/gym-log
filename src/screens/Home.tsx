import { nextDayId } from '../progression';
import type { ActiveSession, Plan, Session } from '../types';
import { countSets, fmtDate } from '../workout';

interface Props {
  plan: Plan;
  sessions: Session[];
  active: ActiveSession | null;
  pending: number;
  syncLabel: string | null;
  onStart: (dayId: string) => void;
  onResume: () => void;
  onHistory: () => void;
  onSettings: () => void;
  onSync: () => void;
}

export function Home({ plan, sessions, active, pending, syncLabel, onStart, onResume, onHistory, onSettings, onSync }: Props) {
  const next = nextDayId(
    plan.days.map((d) => d.id),
    sessions,
  );
  const lastDone = new Map<string, number>();
  for (const s of sessions) lastDone.set(s.dayId, Math.max(lastDone.get(s.dayId) ?? 0, s.finishedAt));
  const activeDay = active && plan.days.find((d) => d.id === active.dayId);

  return (
    <div className="screen home">
      <header className="home-head">
        <h1>Gym Log</h1>
        {pending > 0 && (
          <button type="button" className="pill" onClick={onSync}>
            {pending} to sync{syncLabel ? ` · ${syncLabel}` : ''}
          </button>
        )}
      </header>

      {activeDay && (
        <button type="button" className="card resume" onClick={onResume}>
          <span className="resume-title">Resume {activeDay.name}</span>
          <span className="muted">{countSets(active)} sets logged</span>
        </button>
      )}

      <div className="days">
        {plan.days.map((d) => {
          const isNext = d.id === next;
          const last = lastDone.get(d.id);
          return (
            <button type="button" key={d.id} className={`day-btn ${isNext ? 'next' : ''}`} onClick={() => onStart(d.id)}>
              <span className="day-label">
                {d.label}
                {isNext && <span className="badge">Next</span>}
              </span>
              <span className="day-name">{d.name}</span>
              <span className="day-sub">
                {d.exercises.length} exercises{last ? ` · last ${fmtDate(last)}` : ''}
              </span>
            </button>
          );
        })}
      </div>

      <div className="home-nav">
        <button type="button" className="nav-btn" onClick={onHistory}>
          History
        </button>
        <button type="button" className="nav-btn" onClick={onSettings}>
          Settings
        </button>
      </div>
    </div>
  );
}
