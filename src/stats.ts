import { startOfWeek } from './muscles';
import { exerciseKey, fmtKg } from './progression';
import type { LoadKind, LoggedSet, Session } from './types';

export interface RecordEvent {
  at: number;
  exercise: string;
  /** What kind of record, e.g. "Weight", "Reps at 5 kg", "Est. 1RM", "Less assist", "Reps". */
  label: string;
  value: string;
  before: string;
}

interface Measured {
  at: number;
  top: number;
  topReps: number;
  mostReps: number;
  e1rm: number;
}

/** Epley estimate of a one-rep max. */
export function e1rm(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function measure(kind: LoadKind, sets: LoggedSet[], at: number): Measured {
  let top: number | null = null;
  let topReps = 0;
  let mostReps = 0;
  let best = 0;
  for (const s of sets) {
    const better = top === null || (kind === 'assist' ? s.weight < top : s.weight > top);
    if (better) {
      top = s.weight;
      topReps = s.reps;
    } else if (s.weight === top && s.reps > topReps) {
      topReps = s.reps;
    }
    mostReps = Math.max(mostReps, s.reps);
    best = Math.max(best, e1rm(s.weight, s.reps));
  }
  return { at, top: top ?? 0, topReps, mostReps, e1rm: best };
}

/**
 * Personal records, oldest first. The first session of an exercise is the baseline, not a record.
 * Same rules as the PRs tab that the Apps Script builds in the sheet, with one difference: an
 * estimated-1RM record is left out when the same session already set a weight or reps record
 * for that exercise, because it would say the same thing twice.
 */
export function findRecords(sessions: Session[]): RecordEvent[] {
  const byExercise = new Map<string, { name: string; kind: LoadKind; list: Measured[] }>();
  for (const s of [...sessions].sort((a, b) => a.finishedAt - b.finishedAt)) {
    for (const e of s.entries) {
      if (e.sets.length === 0) continue;
      const key = exerciseKey(e.name);
      const ex = byExercise.get(key) ?? { name: e.name, kind: e.kind, list: [] };
      ex.kind = e.kind;
      ex.list.push(measure(e.kind, e.sets, s.finishedAt));
      byExercise.set(key, ex);
    }
  }

  const out: RecordEvent[] = [];
  for (const ex of byExercise.values()) {
    const [first, ...rest] = ex.list;
    const best = { top: first.top, topReps: first.topReps, e1rm: first.e1rm, reps: first.mostReps };
    for (const s of rest) {
      const add = (label: string, value: string, before: string) => out.push({ at: s.at, exercise: ex.name, label, value, before });
      if (ex.kind === 'bodyweight') {
        if (s.mostReps > best.reps) {
          add('Reps', `${s.mostReps} reps`, `${best.reps} reps`);
          best.reps = s.mostReps;
        }
        continue;
      }
      const heavier = ex.kind === 'assist' ? s.top < best.top : s.top > best.top;
      const improved = heavier || (s.top === best.top && s.topReps > best.topReps);
      if (heavier) {
        add(ex.kind === 'assist' ? 'Less assist' : 'Weight', `${fmtKg(s.top)} kg`, `${fmtKg(best.top)} kg`);
        best.top = s.top;
        best.topReps = s.topReps;
      } else if (s.top === best.top && s.topReps > best.topReps) {
        add(`Reps at ${fmtKg(s.top)} kg`, `${s.topReps} reps`, `${best.topReps} reps`);
        best.topReps = s.topReps;
      }
      if (ex.kind === 'weight' && s.e1rm > best.e1rm + 0.049) {
        if (!improved) add('Est. 1RM', `${round1(s.e1rm)} kg`, `${round1(best.e1rm)} kg`);
        best.e1rm = s.e1rm;
      }
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

export interface WeekSummary {
  workouts: number;
  sets: number;
  /** Monday to Sunday: was there a workout that day. */
  days: boolean[];
  /** Index of today in `days`. */
  today: number;
}

export function weekSummary(sessions: Session[], now: number): WeekSummary {
  const start = startOfWeek(now);
  const days = Array<boolean>(7).fill(false);
  let workouts = 0;
  let sets = 0;
  for (const s of sessions) {
    if (s.finishedAt < start) continue;
    workouts++;
    for (const e of s.entries) sets += e.sets.length;
    days[(new Date(s.finishedAt).getDay() + 6) % 7] = true;
  }
  return { workouts, sets, days, today: (new Date(now).getDay() + 6) % 7 };
}
