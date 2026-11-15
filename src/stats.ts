import { emptyVolume, startOfWeek, targetsLookup, weeklyVolume, type Volume } from './muscles';
import { exerciseKey, fmtKg, sessionScore } from './progression';
import type { LoadKind, LoggedSet, Plan, Session } from './types';

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
  /** Heaviest weight of the session; for assisted work the lowest assist. */
  top: number;
  /** Most reps done at the top weight. */
  topReps: number;
  mostReps: number;
  e1rm: number;
  /** Same number as the trend line on the exercise card. */
  score: number;
}

interface ExerciseHistory {
  name: string;
  kind: LoadKind;
  list: Measured[];
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
  return { at, top: top ?? 0, topReps, mostReps, e1rm: best, score: sessionScore(kind, sets) };
}

/** Every exercise with one measured record per session, oldest first. History is shared by exercise name. */
function histories(sessions: Session[]): ExerciseHistory[] {
  const byExercise = new Map<string, ExerciseHistory>();
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
  return [...byExercise.values()];
}

/**
 * Personal records, oldest first. The first session of an exercise is the baseline, not a record.
 * Same rules as the PRs tab that the Apps Script builds in the sheet, with one difference: an
 * estimated-1RM record is left out when the same session already set a weight or reps record
 * for that exercise, because it would say the same thing twice.
 */
export function findRecords(sessions: Session[]): RecordEvent[] {
  const out: RecordEvent[] = [];
  for (const ex of histories(sessions)) {
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

// ---------- progress per exercise ----------

export interface ExerciseProgress {
  name: string;
  kind: LoadKind;
  sessions: number;
  firstAt: number;
  lastAt: number;
  /** Best set of the first and of the latest session: top weight and the most reps done with it. */
  first: { weight: number; reps: number };
  latest: { weight: number; reps: number };
  /** Heaviest weight ever; lowest assist for assisted work. */
  bestWeight: number;
  /** Estimated 1RM, only for normally loaded exercises. */
  e1rmFirst: number | null;
  e1rmLatest: number | null;
  e1rmBest: number | null;
  /** Change of the trend score from the first to the latest session, in percent. Null with one session. */
  changePct: number | null;
  /** Trend scores of the last sessions, oldest first. */
  trend: number[];
}

export function exerciseProgress(sessions: Session[], trendLength = 8): ExerciseProgress[] {
  return histories(sessions)
    .map((ex): ExerciseProgress => {
      const first = ex.list[0];
      const last = ex.list[ex.list.length - 1];
      const weighted = ex.kind === 'weight';
      const bestWeight = ex.list.reduce((b, s) => (ex.kind === 'assist' ? Math.min(b, s.top) : Math.max(b, s.top)), first.top);
      return {
        name: ex.name,
        kind: ex.kind,
        sessions: ex.list.length,
        firstAt: first.at,
        lastAt: last.at,
        first: { weight: first.top, reps: first.topReps },
        latest: { weight: last.top, reps: last.topReps },
        bestWeight,
        e1rmFirst: weighted ? round1(first.e1rm) : null,
        e1rmLatest: weighted ? round1(last.e1rm) : null,
        e1rmBest: weighted ? round1(Math.max(...ex.list.map((s) => s.e1rm))) : null,
        changePct: ex.list.length > 1 && first.score > 0 ? round1(((last.score - first.score) / first.score) * 100) : null,
        trend: ex.list.slice(-trendLength).map((s) => s.score),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------- weeks ----------

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

export interface WeekTotals {
  /** Monday 00:00 local time. */
  start: number;
  workouts: number;
  sets: number;
  /** Weight × reps in kg, counted for normally loaded exercises only. */
  volume: number;
  /** Hard sets per muscle: primary 1, secondary 0.5. */
  muscles: Volume;
}

/**
 * One entry per week, oldest first, ending with the current week. Covers the weeks since the
 * first workout, at least `minWeeks` and at most `maxWeeks`. Weeks without training are included.
 */
export function weeklyTotals(sessions: Session[], plan: Plan, now: number, maxWeeks = 8, minWeeks = 4): WeekTotals[] {
  const earliest = sessions.reduce((t, s) => Math.min(t, s.finishedAt), Infinity);
  const starts: number[] = [];
  let start = startOfWeek(now);
  while (starts.length < maxWeeks && (starts.length < minWeeks || start >= startOfWeek(earliest))) {
    starts.unshift(start);
    start = startOfWeek(start - 1); // the Monday before; safe across daylight-saving changes
  }

  const targets = targetsLookup(plan);
  return starts.map((weekStart) => {
    const inWeek = sessions.filter((s) => startOfWeek(s.finishedAt) === weekStart);
    let sets = 0;
    let volume = 0;
    for (const s of inWeek)
      for (const e of s.entries) {
        sets += e.sets.length;
        if (e.kind === 'weight') for (const x of e.sets) volume += x.weight * x.reps;
      }
    const muscles = inWeek.length
      ? weeklyVolume(inWeek.flatMap((s) => s.entries.map((e) => ({ ...targets(e.name), sets: e.sets.length }))))
      : emptyVolume();
    return { start: weekStart, workouts: inWeek.length, sets, volume: round1(volume), muscles };
  });
}
