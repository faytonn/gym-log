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
  onMuscles: () => void;
  onSettings: () => void;
  onSync: () => void;
}

export function Home({ plan, sessions, active, pending, syncLabel, onStart, onResume, onHistory, onMuscles, onSettings, onSync }: Props) {
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
        <div>
          <span className="lab">{fmtDate(Date.now())} · {sessions.length} sessions logged</span>
          <h1>Gym Log</h1>
        </div>
        {pending > 0 && (
          <button type="button" className="tag tag-btn" onClick={onSync}>
            {pending} to sync{syncLabel ? ` · ${syncLabel}` : ''}
          </button>
        )}
      </header>

      {activeDay && (
        <button type="button" className="panel ticks resume" onClick={onResume}>
          <span className="lab">In progress · {countSets(active)} sets logged</span>
          <span className="resume-title">Resume {activeDay.name}</span>
        </button>
      )}

      <div className="days">
        {plan.days.map((d, i) => {
          const isNext = d.id === next;
          const last = lastDone.get(d.id);
          return (
            <button type="button" key={d.id} className={`panel day-btn ${isNext ? 'next ticks' : ''}`} onClick={() => onStart(d.id)}>
              <span className="lab">
                {String(i + 1).padStart(2, '0')} · {d.label} · {d.exercises.length} exercises{last ? ` · last ${fmtDate(last)}` : ''}
              </span>
              <span className="day-name">{d.name}</span>
              {isNext && <span className="tag day-tag">Next</span>}
            </button>
          );
        })}
      </div>

      <div className="home-nav">
        <button type="button" className="btn" onClick={onHistory}>
          History
        </button>
        <button type="button" className="btn" onClick={onMuscles}>
          Muscles
        </button>
        <button type="button" className="btn" onClick={onSettings}>
          Settings
        </button>
      </div>
    </div>
  );
}
