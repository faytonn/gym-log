import { fmtKg, workingWeight } from './progression';
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
