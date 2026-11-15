import { useMemo } from 'react';
import { MUSCLE_LABEL, loggedVolume, planVolume, startOfWeek, type Muscle } from '../muscles';
import { nextDayId } from '../progression';
import { findRecords, weekSummary } from '../stats';
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

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DELTS: Muscle[] = ['side-delts', 'rear-delts', 'front-delts'];
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function Home({ plan, sessions, active, pending, syncLabel, onStart, onResume, onHistory, onMuscles, onSettings, onSync }: Props) {
  const next = nextDayId(
    plan.days.map((d) => d.id),
    sessions,
  );
  const lastDone = new Map<string, number>();
  for (const s of sessions) lastDone.set(s.dayId, Math.max(lastDone.get(s.dayId) ?? 0, s.finishedAt));
  const activeDay = active && plan.days.find((d) => d.id === active.dayId);

  const now = Date.now();
  const weekStart = startOfWeek(now);
  const week = useMemo(() => weekSummary(sessions, now), [sessions, weekStart]); // eslint-disable-line react-hooks/exhaustive-deps
  const records = useMemo(() => findRecords(sessions), [sessions]);
  const recordsThisWeek = records.filter((r) => r.at >= weekStart).length;
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

  return (
    <div className="screen home">
      <header className="home-head">
        <div>
          <span className="lab">
            {fmtDate(now)} · {sessions.length} workouts logged
          </span>
          <h1>Gym Log</h1>
        </div>
        {pending > 0 && (
          <button type="button" className="tag tag-btn" onClick={onSync}>
            {pending} to sync{syncLabel ? ` · ${syncLabel}` : ''}
          </button>
        )}
      </header>

      <section className="panel week" aria-label="This week">
        <div className="week-head">
          <span className="lab">This week</span>
          <div className="weekstrip" role="img" aria-label={`Trained on ${week.days.filter(Boolean).length} of 7 days`}>
            {WEEKDAYS.map((d, i) => (
              <span key={i} className={`${week.days[i] ? 'done' : ''} ${i === week.today ? 'today' : ''}`}>
                {d}
              </span>
            ))}
          </div>
        </div>
        <div className="stat-row">
          <div className="stat">
            <span className="stat-num">
              {week.workouts}
              <small>/{plan.days.length}</small>
            </span>
            <span className="lab">Workouts</span>
          </div>
          <div className="stat">
            <span className="stat-num">{week.sets}</span>
            <span className="lab">Sets</span>
          </div>
          <div className="stat">
            <span className={`stat-num ${recordsThisWeek > 0 ? 'up' : ''}`}>{recordsThisWeek}</span>
            <span className="lab">Records</span>
          </div>
        </div>
      </section>

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

      <button type="button" className="panel delts" onClick={onMuscles}>
        <span className="lab">Delts this week · sets logged / planned</span>
        {DELTS.map((m) => (
          <span key={m} className="delt-row">
            <span>{MUSCLE_LABEL[m]}</span>
            <span className="delt-num">
              {fmt(logged[m])}
              <small> / {fmt(planned[m])}</small>
            </span>
            <span className="vol-bar" aria-hidden="true">
              <span className="vol-fill bm-strong" style={{ width: `${planned[m] > 0 ? Math.min(100, (logged[m] / planned[m]) * 100) : 0}%` }} />
            </span>
          </span>
        ))}
        <span className="lab delts-more">All muscles</span>
      </button>

      <section className="panel" aria-label="Latest records">
        <span className="lab">Latest records</span>
        {records.length === 0 ? (
          <p className="small muted rec-empty">None yet. Records appear from the second session of an exercise.</p>
        ) : (
          <div className="rec-list">
            {records
              .slice(-4)
              .reverse()
              .map((r, i) => (
                <div key={i} className="rec">
                  <span className="rec-main">
                    <span>{r.exercise}</span>
                    <span className="lab">
                      {fmtDate(r.at)} · {r.label}
                    </span>
                  </span>
                  <span className="rec-val">
                    <span className="up">{r.value}</span>
                    <small>was {r.before}</small>
                  </span>
                </div>
              ))}
          </div>
        )}
      </section>

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
