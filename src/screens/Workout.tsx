import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExerciseCard } from '../components/ExerciseCard';
import { ask } from '../components/Dialog';
import { RestTimer } from '../components/RestTimer';
import { keepAwake, unlockAudio } from '../device';
import { findLastEntry, trendFor } from '../progression';
import type { ActiveEntry, ActiveSession, PlanDay, Session, Settings } from '../types';
import { countSets, fmtDuration, initialEntry, repsPrefill, restSecondsFor } from '../workout';

interface Props {
  day: PlanDay;
  active: ActiveSession;
  sessions: Session[];
  settings: Settings;
  update: (fn: (a: ActiveSession) => ActiveSession) => void;
  onFinish: () => void;
  onDiscard: () => void;
  onBack: () => void;
}

function firstIncomplete(day: PlanDay, active: ActiveSession): string | null {
  const ex = day.exercises.find((e) => (active.entries[e.id]?.sets.length ?? 0) < e.sets);
  return ex?.id ?? null;
}

export function Workout({ day, active, sessions, settings, update, onFinish, onDiscard, onBack }: Props) {
  const [open, setOpen] = useState<Set<string>>(() => new Set([firstIncomplete(day, active) ?? '']));
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!settings.keepAwake) return;
    void keepAwake(true);
    const onVis = () => document.visibilityState === 'visible' && void keepAwake(true);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      void keepAwake(false);
    };
  }, [settings.keepAwake]);

  const lastByExercise = useMemo(() => {
    const m = new Map<string, ReturnType<typeof findLastEntry>>();
    for (const ex of day.exercises) m.set(ex.id, findLastEntry(sessions, ex.name, active.id));
    return m;
  }, [day, sessions, active.id]);

  const trends = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const ex of day.exercises) m.set(ex.id, trendFor(sessions, ex.name, ex.kind));
    return m;
  }, [day, sessions]);

  const entryFor = (exId: string): ActiveEntry => {
    const ex = day.exercises.find((e) => e.id === exId)!;
    return active.entries[exId] ?? initialEntry(ex, sessions);
  };

  const patchEntry = (exId: string, patch: Partial<ActiveEntry>) =>
    update((a) => ({ ...a, entries: { ...a.entries, [exId]: { ...entryFor(exId), ...a.entries[exId], ...patch } } }));

  const saveSet = (exId: string) => {
    unlockAudio(); // user gesture: lets the timer beep later on iOS
    const ex = day.exercises.find((e) => e.id === exId)!;
    const entry = entryFor(exId);
    const sets = [...entry.sets, { weight: entry.weight, reps: entry.reps }];
    const reps = repsPrefill(ex, sessions, sets.length, entry.reps);
    const rest = restSecondsFor(ex, settings);
    update((a) => ({
      ...a,
      entries: { ...a.entries, [exId]: { ...entry, sets, reps } },
      restEndsAt: Date.now() + rest * 1000,
      restTotal: rest,
    }));
    if (sets.length === ex.sets) {
      // Exercise complete: collapse it and open the next unfinished one.
      const next = day.exercises.find((e) => e.id !== exId && (active.entries[e.id]?.sets.length ?? 0) < e.sets);
      setOpen(new Set(next ? [next.id] : []));
      if (next) setTimeout(() => document.getElementById(`ex-${next.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
  };

  const deleteSet = (exId: string, i: number) => {
    const entry = entryFor(exId);
    patchEntry(exId, { sets: entry.sets.filter((_, j) => j !== i) });
  };

  const toggle = (exId: string) =>
    setOpen((prev) => {
      const s = new Set(prev);
      if (s.has(exId)) s.delete(exId);
      else s.add(exId);
      return s;
    });

  const skipRest = useCallback(() => update((a) => ({ ...a, restEndsAt: null })), [update]);
  const adjustRest = (d: number) =>
    update((a) => (a.restEndsAt ? { ...a, restEndsAt: a.restEndsAt + d * 1000, restTotal: Math.max(1, a.restTotal + d) } : a));

  const total = countSets(active);
  const planned = day.exercises.reduce((n, e) => n + e.sets, 0);

  return (
    <div className="screen workout">
      <header className="topbar">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back to home">
          ‹
        </button>
        <div className="topbar-title">
          <span className="topbar-sub">
            {day.label} · T+{fmtDuration(now - active.startedAt)} · {String(total).padStart(2, '0')}/{planned} sets
          </span>
          <span>{day.name}</span>
        </div>
        <button type="button" className="btn btn-small btn-accent" onClick={onFinish}>
          Finish
        </button>
      </header>

      <div className="cards">
        {day.exercises.map((ex, i) => (
          <ExerciseCard
            key={ex.id}
            index={i}
            ex={ex}
            entry={entryFor(ex.id)}
            last={lastByExercise.get(ex.id) ?? null}
            trend={trends.get(ex.id) ?? []}
            restSeconds={restSecondsFor(ex, settings)}
            expanded={open.has(ex.id)}
            onToggle={() => toggle(ex.id)}
            onChange={(p) => patchEntry(ex.id, p)}
            onSaveSet={() => saveSet(ex.id)}
            onDeleteSet={(j) => deleteSet(ex.id, j)}
          />
        ))}
        {day.exercises.length === 0 && <p className="muted center">No exercises for this day. Add some in Settings.</p>}

        <button type="button" className="btn btn-accent btn-block" onClick={onFinish}>
          Finish workout
        </button>
        <button
          type="button"
          className="btn btn-danger-text btn-block"
          onClick={async () => (await ask('Discard this workout?', { body: total > 0 ? `${total} logged set${total === 1 ? '' : 's'} will be deleted.` : undefined, confirm: 'Discard workout', danger: true })) && onDiscard()}
        >
          Discard workout
        </button>
      </div>

      <RestTimer endsAt={active.restEndsAt} total={active.restTotal} sound={settings.sound} onAdjust={adjustRest} onSkip={skipRest} />
    </div>
  );
}
