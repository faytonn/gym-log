import { MUSCLE_LABEL, type MuscleTargets } from './muscles';
import { fmtKg, roundKg, workingWeight } from './progression';
import type { Session } from './types';

/** Columns of the "Log" tab in the "Workout Log" Google Sheet. */
export const SHEET_HEADER = [
  'Date',
  'Exercise',
  'Weight (kg)',
  'Set 1',
  'Set 2',
  'Set 3',
  'Set 4',
  'Reps left in tank',
  'Notes',
] as const;

export type SheetRow = (string | number)[];

export function localDate(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** One sheet row per exercise that has at least one logged set. */
export function sessionToRows(session: Session): SheetRow[] {
  const rows: SheetRow[] = [];
  for (const e of session.entries) {
    if (e.sets.length === 0) continue;
    const w = workingWeight(e.sets)!;
    const notes: string[] = [`${session.dayLabel} · ${session.dayName}`];
    if (e.kind === 'assist') notes.push('assist weight');
    if (e.sets.some((s) => s.weight !== w)) notes.push(`weights: ${e.sets.map((s) => fmtKg(s.weight)).join(' / ')}`);
    if (e.sets.length > 4) notes.push(`extra sets: ${e.sets.slice(4).map((s) => s.reps).join(' / ')}`);
    const reps: (number | string)[] = [0, 1, 2, 3].map((i) => e.sets[i]?.reps ?? '');
    rows.push([localDate(session.finishedAt), e.name, Number(fmtKg(w)), ...reps, e.rir ?? '', notes.join('; ')]);
  }
  return rows;
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(sessions: Session[]): string {
  const sorted = [...sessions].sort((a, b) => a.finishedAt - b.finishedAt);
  const lines = [SHEET_HEADER.map(csvCell).join(',')];
  for (const s of sorted) for (const r of sessionToRows(s)) lines.push(r.map(csvCell).join(','));
  return lines.join('\r\n') + '\r\n';
}

/** Columns of the "Sets" tab: one row per set. The summary tabs in the sheet are built from it. */
export const SETS_HEADER = [
  'Date',
  'Session ID',
  'Day',
  'Exercise',
  'Type',
  'Set',
  'Weight (kg)',
  'Reps',
  'Reps left in tank',
  'Primary muscles',
  'Secondary muscles',
] as const;

/** Columns of the "Sessions" tab: one row per workout. */
export const SESSIONS_HEADER = ['Date', 'Session ID', 'Day', 'Start', 'Duration (min)', 'Exercises', 'Sets', 'Volume (kg)'] as const;

export function sessionToSetRows(session: Session, targets: (name: string) => MuscleTargets): SheetRow[] {
  const date = localDate(session.finishedAt);
  const day = `${session.dayLabel} · ${session.dayName}`;
  const rows: SheetRow[] = [];
  for (const e of session.entries) {
    const t = targets(e.name);
    const primary = t.primaryMuscles.map((m) => MUSCLE_LABEL[m]).join(', ');
    const secondary = t.secondaryMuscles
      .filter((m) => !t.primaryMuscles.includes(m))
      .map((m) => MUSCLE_LABEL[m])
      .join(', ');
    e.sets.forEach((s, i) => rows.push([date, session.id, day, e.name, e.kind, i + 1, roundKg(s.weight), s.reps, e.rir ?? '', primary, secondary]));
  }
  return rows;
}

/** Volume is weight × reps, counted for normally loaded exercises only (not assist or bodyweight). */
export function sessionSummaryRow(session: Session): SheetRow {
  const done = session.entries.filter((e) => e.sets.length > 0);
  const start = new Date(session.startedAt);
  const hhmm = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
  let sets = 0;
  let volume = 0;
  for (const e of done) {
    sets += e.sets.length;
    if (e.kind === 'weight') for (const s of e.sets) volume += s.weight * s.reps;
  }
  return [
    localDate(session.finishedAt),
    session.id,
    `${session.dayLabel} · ${session.dayName}`,
    hhmm,
    Math.round((session.finishedAt - session.startedAt) / 60_000),
    done.length,
    sets,
    roundKg(volume),
  ];
}
