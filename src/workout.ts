import { findLastEntry, workingWeight } from './progression';
import type { ActiveEntry, ActiveSession, PlanDay, PlanExercise, Session, Settings } from './types';

export function restSecondsFor(ex: PlanExercise, settings: Settings): number {
  return ex.restSeconds ?? (ex.rest === 'compound' ? settings.compoundRest : settings.isolationRest);
}

/** Starting values for an exercise card: last weight (else starting weight) and last reps for set 1. */
export function initialEntry(ex: PlanExercise, sessions: Session[]): ActiveEntry {
  const last = findLastEntry(sessions, ex.name);
  const weight = (last && workingWeight(last.entry.sets)) ?? ex.startWeight ?? 0;
  const reps = last?.entry.sets[0]?.reps ?? ex.repMin;
  return { sets: [], weight, reps, rir: null };
}

/** Reps to prefill for set number `index` (0-based): what was done on that set last time. */
export function repsPrefill(ex: PlanExercise, sessions: Session[], index: number, current: number): number {
  const last = findLastEntry(sessions, ex.name);
  return last?.entry.sets[index]?.reps ?? current;
}

export function newActive(day: PlanDay, sessions: Session[]): ActiveSession {
  const entries: Record<string, ActiveEntry> = {};
  for (const ex of day.exercises) entries[ex.id] = initialEntry(ex, sessions);
  return { id: crypto.randomUUID(), dayId: day.id, startedAt: Date.now(), entries, restEndsAt: null, restTotal: 0 };
}

export function countSets(active: ActiveSession): number {
  return Object.values(active.entries).reduce((n, e) => n + e.sets.length, 0);
}

export function toSession(active: ActiveSession, day: PlanDay): Session {
  return {
    id: active.id,
    dayId: day.id,
    dayLabel: day.label,
    dayName: day.name,
    startedAt: active.startedAt,
    finishedAt: Date.now(),
    synced: 0,
    entries: day.exercises
      .filter((ex) => (active.entries[ex.id]?.sets.length ?? 0) > 0)
      .map((ex) => ({
        exerciseId: ex.id,
        name: ex.name,
        kind: ex.kind,
        sets: active.entries[ex.id].sets,
        rir: active.entries[ex.id].rir,
      })),
  };
}

export function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  return h ? `${h}:${mm}:${String(s).padStart(2, '0')}` : `${mm}:${String(s).padStart(2, '0')}`;
}

export function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}
