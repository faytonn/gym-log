import type { LoadKind, LoggedSet, PlanExercise, Session, SessionEntry } from './types';

export type HintKind = 'first' | 'add-weight' | 'less-assist' | 'harder' | 'add-rep';

export interface Hint {
  kind: HintKind;
  text: string;
  /** Short explanation, e.g. "42 → 44.5 kg" or "Aim 12 · 11 · 11". */
  detail: string;
  /** Weight to use next time when the hint changes it, otherwise null. */
  suggestedWeight: number | null;
}

/** Rounds away float noise (14.6 + 2.8 = 17.400000000000002). */
export function roundKg(n: number): number {
  return Math.round(n * 100) / 100;
}

export function fmtKg(n: number): string {
  return String(roundKg(n));
}

/** Exercise names are the shared key across days: "Lateral raise" on Mon/Tue/Sat is one history. */
export function exerciseKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** The weight used on most sets; ties go to the earliest set. */
export function workingWeight(sets: LoggedSet[]): number | null {
  if (sets.length === 0) return null;
  const counts = new Map<number, number>();
  for (const s of sets) counts.set(s.weight, (counts.get(s.weight) ?? 0) + 1);
  let best = sets[0].weight;
  for (const s of sets) if (counts.get(s.weight)! > counts.get(best)!) best = s.weight;
  return best;
}

/**
 * Double progression hint for the next session, based on the most recent logged entry
 * of this exercise (any day).
 *
 * - Lowest-rep set reached the top of the rep range -> increase the load
 *   (assist: less assist; bodyweight: harder variation).
 * - Otherwise -> same load, +1 rep.
 * - Never logged -> find your weight.
 */
export function nextHint(
  ex: Pick<PlanExercise, 'repMin' | 'repMax' | 'kind' | 'increment'>,
  last: Pick<SessionEntry, 'sets'> | null,
): Hint {
  const sets = last?.sets ?? [];
  if (sets.length === 0) {
    return {
      kind: 'first',
      text: 'First session: find your weight',
      detail: `Pick a weight you can do for ${ex.repMin}–${ex.repMax} reps with 1–2 left in the tank`,
      suggestedWeight: null,
    };
  }

  const reps = sets.map((s) => s.reps);
  const lowest = Math.min(...reps);
  const w = workingWeight(sets)!;

  if (lowest >= ex.repMax) {
    return loadUp(ex.kind, w, ex.increment);
  }

  const lowestIdx = reps.indexOf(lowest);
  const aim = reps.map((r, i) => (i === lowestIdx ? Math.min(r + 1, ex.repMax) : r));
  const sameText: Record<LoadKind, string> = {
    weight: 'Same weight, +1 rep',
    assist: 'Same assist, +1 rep',
    bodyweight: 'Same version, +1 rep',
  };
  return {
    kind: 'add-rep',
    text: sameText[ex.kind],
    detail: `Aim ${aim.join(' · ')}`,
    suggestedWeight: null,
  };
}

function loadUp(kind: LoadKind, w: number, increment: number): Hint {
  if (kind === 'assist') {
    const next = roundKg(Math.max(0, w - increment));
    return { kind: 'less-assist', text: 'Less assist', detail: `${fmtKg(w)} → ${fmtKg(next)} kg assist`, suggestedWeight: next };
  }
  if (kind === 'bodyweight') {
    return {
      kind: 'harder',
      text: 'Make it harder (straighter legs)',
      detail: 'Top of the range on every set',
      suggestedWeight: null,
    };
  }
  const next = roundKg(w + increment);
  return { kind: 'add-weight', text: 'Add weight (smallest jump)', detail: `${fmtKg(w)} → ${fmtKg(next)} kg`, suggestedWeight: next };
}

export interface LastEntry {
  entry: SessionEntry;
  session: Session;
}

/** Most recent session entry for an exercise name, across all days. Entries with no sets are ignored. */
export function findLastEntry(sessions: Session[], name: string, excludeSessionId?: string): LastEntry | null {
  const key = exerciseKey(name);
  let best: LastEntry | null = null;
  for (const session of sessions) {
    if (session.id === excludeSessionId) continue;
    if (best && session.finishedAt <= best.session.finishedAt) continue;
    const entry = session.entries.find((e) => exerciseKey(e.name) === key && e.sets.length > 0);
    if (entry) best = { entry, session };
  }
  return best;
}

/** Day that comes after the most recently finished session, wrapping around. First day if nothing logged. */
export function nextDayId(dayIds: string[], sessions: Pick<Session, 'dayId' | 'finishedAt'>[]): string | null {
  if (dayIds.length === 0) return null;
  let latest: Pick<Session, 'dayId' | 'finishedAt'> | null = null;
  for (const s of sessions) if (!latest || s.finishedAt > latest.finishedAt) latest = s;
  if (!latest) return dayIds[0];
  const i = dayIds.indexOf(latest.dayId);
  if (i === -1) return dayIds[0];
  return dayIds[(i + 1) % dayIds.length];
}

export interface SetDelta {
  /** "+1", "−2", "=" for reps at the same weight; "+2.5kg" when the weight changed. */
  text: string;
  better: boolean;
}

/** Change of one set against the same set last session. Null when there is nothing to compare with. */
export function setDelta(kind: LoadKind, set: LoggedSet, prev: LoggedSet | undefined): SetDelta | null {
  if (!prev) return null;
  if (set.weight !== prev.weight) {
    const d = roundKg(set.weight - prev.weight);
    return { text: `${d > 0 ? '+' : '−'}${fmtKg(Math.abs(d))}kg`, better: kind === 'assist' ? d < 0 : d > 0 };
  }
  const d = set.reps - prev.reps;
  return { text: d === 0 ? '=' : `${d > 0 ? '+' : '−'}${Math.abs(d)}`, better: d > 0 };
}

/**
 * One number per session for the small trend line: estimated 1-rep max (Epley) of the best set,
 * so both more weight and more reps move it up. Assist counts as less load; bodyweight uses reps.
 */
export function sessionScore(kind: LoadKind, sets: LoggedSet[]): number {
  let best = 0;
  for (const s of sets) {
    const load = kind === 'bodyweight' ? 1 : kind === 'assist' ? Math.max(0, 100 - s.weight) : s.weight;
    best = Math.max(best, load * (1 + s.reps / 30));
  }
  return best;
}

/** Scores of the most recent sessions of an exercise, oldest first. */
export function trendFor(sessions: Session[], name: string, kind: LoadKind, limit = 6): number[] {
  const key = exerciseKey(name);
  const rows: { t: number; score: number }[] = [];
  for (const s of sessions) {
    const e = s.entries.find((x) => exerciseKey(x.name) === key && x.sets.length > 0);
    if (e) rows.push({ t: s.finishedAt, score: sessionScore(kind, e.sets) });
  }
  return rows
    .sort((a, b) => a.t - b.t)
    .slice(-limit)
    .map((r) => r.score);
}
