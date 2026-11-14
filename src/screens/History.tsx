import { useMemo, useState } from 'react';
import { LineChart, type Point } from '../components/LineChart';
import { db } from '../db';
import { localDate, toCsv } from '../export';
import { exerciseKey, fmtKg, workingWeight } from '../progression';
import type { Session } from '../types';
import { fmtDate, fmtDuration } from '../workout';

interface Props {
  sessions: Session[];
  syncing: boolean;
  syncLabel: string | null;
  onSync: () => void;
  onBack: () => void;
}

async function downloadCsv(sessions: Session[]) {
  const name = `workout-log-${localDate(Date.now())}.csv`;
  const blob = new Blob([toCsv(sessions)], { type: 'text/csv' });
  const file = new File([blob], name, { type: 'text/csv' });
  // On iPhone the share sheet ("Save to Files") is the reliable way to get a file out of a home-screen app.
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return;
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function History({ sessions, syncing, syncLabel, onSync, onBack }: Props) {
  const [tab, setTab] = useState<'sessions' | 'progress'>('sessions');
  const sorted = useMemo(() => [...sessions].sort((a, b) => b.finishedAt - a.finishedAt), [sessions]);
  const pending = sessions.filter((s) => s.synced === 0).length;

  return (
    <div className="screen">
      <header className="topbar">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back to home">
          ‹
        </button>
        <div className="topbar-title">
          <span>History</span>
        </div>
        <button type="button" className="btn btn-small btn-secondary" disabled={sessions.length === 0} onClick={() => downloadCsv(sessions)}>
          Download CSV
        </button>
      </header>

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'sessions'} className={tab === 'sessions' ? 'on' : ''} onClick={() => setTab('sessions')}>
          Sessions
        </button>
        <button type="button" role="tab" aria-selected={tab === 'progress'} className={tab === 'progress' ? 'on' : ''} onClick={() => setTab('progress')}>
          Progress
        </button>
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
        <p className="muted center">No workouts yet.</p>
      ) : tab === 'sessions' ? (
        <SessionList sessions={sorted} />
      ) : (
        <Progress sessions={sorted} />
      )}
    </div>
  );
}

function SessionList({ sessions }: { sessions: Session[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="cards">
      {sessions.map((s) => (
        <section key={s.id} className="card">
          <button type="button" className="session-head" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>
            <span>
              <strong>{fmtDate(s.finishedAt)}</strong> · {s.dayName}
              <span className="muted small block">
                {s.entries.length} exercises · {fmtDuration(s.finishedAt - s.startedAt)}
              </span>
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
                onClick={() => confirm(`Delete the ${s.dayName} workout from ${fmtDate(s.finishedAt)}? This only deletes it from this phone.`) && db.sessions.delete(s.id)}
              >
                Delete workout
              </button>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function Progress({ sessions }: { sessions: Session[] }) {
  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sessions) for (const e of s.entries) if (e.sets.length && !m.has(exerciseKey(e.name))) m.set(exerciseKey(e.name), e.name);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [sessions]);
  const [key, setKey] = useState(names[0]?.[0] ?? '');

  const rows = useMemo(() => {
    const out: { t: number; weight: number; best: { weight: number; reps: number }; reps: number[]; assist: boolean }[] = [];
    for (const s of sessions) {
      const e = s.entries.find((x) => exerciseKey(x.name) === key && x.sets.length);
      if (!e) continue;
      const best = e.sets.reduce((b, x) => (x.reps > b.reps || (x.reps === b.reps && x.weight > b.weight) ? x : b));
      out.push({ t: s.finishedAt, weight: workingWeight(e.sets)!, best, reps: e.sets.map((x) => x.reps), assist: e.kind === 'assist' });
    }
    return out.sort((a, b) => a.t - b.t);
  }, [sessions, key]);

  const assist = rows.some((r) => r.assist);
  const weightPts: Point[] = rows.map((r) => ({ t: r.t, y: r.weight, label: `${fmtKg(r.weight)} kg${assist ? ' assist' : ''}` }));
  const bestPts: Point[] = rows.map((r) => ({ t: r.t, y: r.best.reps, label: `${fmtKg(r.best.weight)} kg × ${r.best.reps}` }));

  return (
    <div className="cards">
      <label className="field">
        <span className="muted">Exercise</span>
        <select value={key} onChange={(e) => setKey(e.target.value)}>
          {names.map(([k, n]) => (
            <option key={k} value={k}>
              {n}
            </option>
          ))}
        </select>
      </label>
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
