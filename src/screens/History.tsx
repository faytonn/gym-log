import { useMemo, useState } from 'react';
import { BarChart } from '../components/BarChart';
import { LineChart, type Point } from '../components/LineChart';
import { Sparkline } from '../components/Sparkline';
import { db } from '../db';
import { ask } from '../components/Dialog';
import { localDate, toCsv } from '../export';
import { saveFile } from '../files';
import { MUSCLES, MUSCLE_LABEL, volumeBand } from '../muscles';
import { exerciseKey, fmtKg, workingWeight } from '../progression';
import { exerciseProgress, findRecords, weeklyTotals, type ExerciseProgress } from '../stats';
import type { Plan, Session } from '../types';
import { fmtDate, fmtDuration } from '../workout';

interface Props {
  plan: Plan;
  sessions: Session[];
  syncing: boolean;
  syncLabel: string | null;
  onSync: () => void;
}

type Tab = 'sessions' | 'progress' | 'weekly' | 'records';
const TABS: [Tab, string][] = [
  ['sessions', 'Sessions'],
  ['progress', 'Progress'],
  ['weekly', 'Weekly'],
  ['records', 'Records'],
];

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const shortDate = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

const downloadCsv = (sessions: Session[]) => saveFile(`workout-log-${localDate(Date.now())}.csv`, toCsv(sessions), 'text/csv');

export function History({ plan, sessions, syncing, syncLabel, onSync }: Props) {
  const [tab, setTab] = useState<Tab>('sessions');
  const sorted = useMemo(() => [...sessions].sort((a, b) => b.finishedAt - a.finishedAt), [sessions]);
  const pending = sessions.filter((s) => s.synced === 0).length;

  return (
    <div className="screen">
      <header className="topbar topbar-plain">
        <div className="topbar-title">
          <span className="topbar-sub">{sessions.length} workouts logged</span>
          <span>Stats</span>
        </div>
        <button type="button" className="btn btn-small btn-secondary" disabled={sessions.length === 0} onClick={() => void downloadCsv(sessions)}>
          CSV
        </button>
      </header>

      <div className="tabs tabs-4" role="tablist">
        {TABS.map(([id, label]) => (
          <button type="button" key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {pending > 0 && (
        <div className="card sync-strip">
          <span>
            {pending} workout{pending > 1 ? 's' : ''} not synced{syncLabel ? ` · ${syncLabel}` : ''}
          </span>
          <button type="button" className="btn btn-small btn-accent" disabled={syncing} onClick={onSync}>
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="muted center">No workouts yet. Stats appear after your first one.</p>
      ) : tab === 'sessions' ? (
        <SessionList sessions={sorted} />
      ) : tab === 'progress' ? (
        <Progress sessions={sorted} />
      ) : tab === 'weekly' ? (
        <Weekly sessions={sorted} plan={plan} />
      ) : (
        <Records sessions={sorted} />
      )}
    </div>
  );
}

function SessionList({ sessions }: { sessions: Session[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="cards">
      {sessions.map((s) => {
        const sets = s.entries.reduce((n, e) => n + e.sets.length, 0);
        return (
          <section key={s.id} className="card">
            <button type="button" className="session-head" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>
              <span>
                <span className="lab">
                  {fmtDate(s.finishedAt)} · {fmtDuration(s.finishedAt - s.startedAt)} · {sets} sets
                </span>
                <span className="session-name">{s.dayName}</span>
              </span>
              <span className={`sync-dot ${s.synced ? 'ok' : 'wait'}`} title={s.synced ? 'Synced' : (s.lastSyncError ?? 'Not synced yet')}>
                {s.synced ? 'Synced' : 'Queued'}
              </span>
            </button>
            {open === s.id && (
              <div className="session-body">
                {s.entries.map((e) => (
                  <div key={e.exerciseId} className="session-row">
                    <span>{e.name}</span>
                    <span className="muted">
                      {fmtKg(workingWeight(e.sets)!)} kg · {e.sets.map((x) => x.reps).join(' · ')}
                      {e.rir !== null ? ` · ${e.rir} left` : ''}
                    </span>
                  </div>
                ))}
                {!s.synced && s.lastSyncError && <p className="small warn">Last sync error: {s.lastSyncError}</p>}
                <button
                  type="button"
                  className="btn btn-danger-text btn-block"
                  onClick={async () =>
                    (await ask(`Delete the ${s.dayName} workout from ${fmtDate(s.finishedAt)}?`, {
                      body: s.synced ? 'It is deleted from this phone only. The rows in your Google Sheet stay.' : 'It was never synced, so this cannot be undone.',
                      confirm: 'Delete workout',
                      danger: true,
                    })) && db.sessions.delete(s.id)
                  }
                >
                  Delete workout
                </button>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

// ---------- Progress: every exercise at a glance, tap one for its charts ----------

function Progress({ sessions }: { sessions: Session[] }) {
  const all = useMemo(() => exerciseProgress(sessions), [sessions]);
  const [key, setKey] = useState<string | null>(null);
  const picked = key ? all.find((p) => exerciseKey(p.name) === key) : undefined;

  if (picked) return <ExerciseDetail p={picked} sessions={sessions} onBack={() => setKey(null)} />;

  return (
    <section className="card">
      <span className="lab">Exercise · latest best set · change since first session</span>
      <div className="prog-list">
        {all.map((p) => (
          <button type="button" key={p.name} className="prog-row" onClick={() => setKey(exerciseKey(p.name))}>
            <span className="prog-main">
              <span>{p.name}</span>
              <span className="lab">
                {p.sessions} session{p.sessions > 1 ? 's' : ''} · {fmtKg(p.latest.weight)} kg × {p.latest.reps}
                {p.kind === 'assist' ? ' · assist' : ''}
              </span>
            </span>
            <Sparkline values={p.trend} />
            <span className={`prog-change ${p.changePct !== null && p.changePct > 0 ? 'up' : ''}`}>
              {p.changePct === null ? '—' : `${p.changePct > 0 ? '+' : ''}${fmt(p.changePct)}%`}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ExerciseDetail({ p, sessions, onBack }: { p: ExerciseProgress; sessions: Session[]; onBack: () => void }) {
  const key = exerciseKey(p.name);
  const rows = useMemo(() => {
    const out: { t: number; weight: number; best: { weight: number; reps: number }; reps: number[] }[] = [];
    for (const s of sessions) {
      const e = s.entries.find((x) => exerciseKey(x.name) === key && x.sets.length);
      if (!e) continue;
      const best = e.sets.reduce((b, x) => (x.reps > b.reps || (x.reps === b.reps && x.weight > b.weight) ? x : b));
      out.push({ t: s.finishedAt, weight: workingWeight(e.sets)!, best, reps: e.sets.map((x) => x.reps) });
    }
    return out.sort((a, b) => a.t - b.t);
  }, [sessions, key]);

  const assist = p.kind === 'assist';
  const weightPts: Point[] = rows.map((r) => ({ t: r.t, y: r.weight, label: `${fmtKg(r.weight)} kg${assist ? ' assist' : ''}` }));
  const bestPts: Point[] = rows.map((r) => ({ t: r.t, y: r.best.reps, label: `${fmtKg(r.best.weight)} kg × ${r.best.reps}` }));

  return (
    <div className="cards">
      <button type="button" className="btn btn-secondary btn-block" onClick={onBack}>
        ‹ All exercises
      </button>
      <section className="card ticks">
        <span className="lab">
          {p.sessions} session{p.sessions > 1 ? 's' : ''} · since {shortDate(p.firstAt)}
        </span>
        <div className="session-name">{p.name}</div>
        <div className="stat-row detail-stats">
          <div className="stat">
            <span className="stat-num">
              {fmtKg(p.latest.weight)}
              <small> × {p.latest.reps}</small>
            </span>
            <span className="lab">Latest best set</span>
          </div>
          <div className="stat">
            <span className="stat-num">{p.kind === 'bodyweight' ? '—' : fmtKg(p.bestWeight)}</span>
            <span className="lab">{assist ? 'Least assist' : 'Best weight'}</span>
          </div>
          <div className="stat">
            <span className={`stat-num ${p.changePct !== null && p.changePct > 0 ? 'up' : ''}`}>
              {p.changePct === null ? '—' : `${p.changePct > 0 ? '+' : ''}${fmt(p.changePct)}`}
              {p.changePct !== null && <small>%</small>}
            </span>
            <span className="lab">Change</span>
          </div>
        </div>
        {p.e1rmLatest !== null && (
          <p className="small muted">
            Estimated 1RM: {fmt(p.e1rmLatest)} kg now, {fmt(p.e1rmFirst!)} kg at the start, {fmt(p.e1rmBest!)} kg at best.
          </p>
        )}
      </section>
      <section className="card">
        <LineChart title={assist ? 'Assist weight (lower is stronger)' : 'Working weight'} unit="kg" points={weightPts} />
      </section>
      <section className="card">
        <LineChart title="Best set (reps)" unit="reps" points={bestPts} />
      </section>
      <section className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>kg</th>
              <th>Reps</th>
            </tr>
          </thead>
          <tbody>
            {[...rows].reverse().map((r) => (
              <tr key={r.t}>
                <td>{fmtDate(r.t)}</td>
                <td>{fmtKg(r.weight)}</td>
                <td>{r.reps.join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

// ---------- Weekly: totals per week and sets per muscle ----------

function Weekly({ sessions, plan }: { sessions: Session[]; plan: Plan }) {
  const weeks = useMemo(() => weeklyTotals(sessions, plan, Date.now()), [sessions, plan]);
  const recent = weeks.slice(-5);
  const muscles = MUSCLES.map((m) => ({ m, total: recent.reduce((n, w) => n + w.muscles[m], 0) }))
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total);

  return (
    <div className="cards">
      <section className="card">
        <BarChart title="Sets per week" bars={weeks.map((w) => ({ label: shortDate(w.start), value: w.sets, detail: `${w.sets} sets · ${w.workouts} workout${w.workouts === 1 ? '' : 's'}` }))} />
      </section>
      <section className="card">
        <BarChart title="Volume per week (kg)" bars={weeks.map((w) => ({ label: shortDate(w.start), value: w.volume, detail: `${Math.round(w.volume).toLocaleString()} kg` }))} />
        <p className="small muted chart-note">Weight × reps. Assisted and bodyweight exercises are not counted.</p>
      </section>
      <section className="card">
        <span className="lab">Hard sets per muscle · week starting</span>
        <div className="heat-scroll">
          <table className="table heat">
            <thead>
              <tr>
                <th>Muscle</th>
                {recent.map((w) => (
                  <th key={w.start} className="num">
                    {shortDate(w.start)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {muscles.map(({ m }) => (
                <tr key={m}>
                  <td>{MUSCLE_LABEL[m]}</td>
                  {recent.map((w) => (
                    <td key={w.start} className="num">
                      <span className={`heat-cell bm-${volumeBand(w.muscles[m])}`}>{fmt(w.muscles[m])}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted chart-note">Primary muscle 1 set, secondary 0.5. Shading: 5–9 light, 10–15 medium, 16+ strong.</p>
      </section>
    </div>
  );
}

// ---------- Records ----------

function Records({ sessions }: { sessions: Session[] }) {
  const records = useMemo(() => findRecords(sessions).reverse(), [sessions]);
  return (
    <section className="card">
      <span className="lab">{records.length} personal records · newest first</span>
      {records.length === 0 ? (
        <p className="small muted rec-empty">None yet. Records appear from the second session of an exercise.</p>
      ) : (
        <div className="rec-list">
          {records.map((r, i) => (
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
  );
}
