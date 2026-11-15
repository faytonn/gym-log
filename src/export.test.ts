import { describe, expect, it } from 'vitest';
import { SESSIONS_HEADER, SETS_HEADER, SHEET_HEADER, sessionSummaryRow, sessionToRows, sessionToSetRows, toCsv } from './export';
import { defaultMuscles } from './muscles';
import type { Session } from './types';

const finishedAt = new Date(2026, 10, 14, 18, 30).getTime();

const s: Session = {
  id: 's1',
  dayId: 'mon-upper-a',
  dayLabel: 'Mon',
  dayName: 'Upper A',
  startedAt: finishedAt - 3600_000,
  finishedAt,
  synced: 0,
  entries: [
    { exerciseId: 'a', name: 'Lat pulldown', kind: 'weight', rir: 2, sets: [12, 11, 10, 9].map((reps) => ({ weight: 42, reps })) },
    { exerciseId: 'b', name: 'Assisted pull-up', kind: 'assist', rir: null, sets: [{ weight: 35, reps: 8 }] },
    { exerciseId: 'c', name: 'Skipped', kind: 'weight', rir: null, sets: [] },
    {
      exerciseId: 'd',
      name: 'Incline DB press, "heavy"',
      kind: 'weight',
      rir: 1,
      sets: [{ weight: 15, reps: 10 }, { weight: 15, reps: 9 }, { weight: 12.5, reps: 11 }],
    },
  ],
};

describe('sessionToRows', () => {
  it('maps to the sheet columns and skips exercises with no sets', () => {
    const rows = sessionToRows(s);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual(['2026-11-14', 'Lat pulldown', 42, 12, 11, 10, 9, 2, 'Mon · Upper A']);
    expect(rows[0]).toHaveLength(SHEET_HEADER.length);
    expect(rows[1]).toEqual(['2026-11-14', 'Assisted pull-up', 35, 8, '', '', '', '', 'Mon · Upper A; assist weight']);
    expect(rows[2][2]).toBe(15);
    expect(rows[2][8]).toBe('Mon · Upper A; weights: 15 / 15 / 12.5');
  });
});

describe('toCsv', () => {
  it('has a header and escapes quotes and commas', () => {
    const csv = toCsv([s]);
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe('Date,Exercise,Weight (kg),Set 1,Set 2,Set 3,Set 4,Reps left in tank,Notes');
    expect(lines).toHaveLength(4);
    expect(lines[3]).toContain('"Incline DB press, ""heavy"""');
  });
});

describe('sessionToSetRows and sessionSummaryRow', () => {
  const targets = (name: string) => defaultMuscles(name);

  it('writes one row per set with the muscles of the exercise', () => {
    const rows = sessionToSetRows(s, targets);
    expect(rows).toHaveLength(4 + 1 + 3);
    expect(rows[0]).toEqual(['2026-11-14', 's1', 'Mon · Upper A', 'Lat pulldown', 'weight', 1, 42, 12, 2, 'Lats', 'Biceps, Rear delts, Upper back / traps']);
    expect(rows[3].slice(5, 8)).toEqual([4, 42, 9]);
    expect(rows[4].slice(3, 9)).toEqual(['Assisted pull-up', 'assist', 1, 35, 8, '']);
    expect(rows.every((r) => r.length === SETS_HEADER.length)).toBe(true);
  });

  it('summarises the workout and leaves assist weight out of the volume', () => {
    const row = sessionSummaryRow(s);
    expect(row).toHaveLength(SESSIONS_HEADER.length);
    expect(row.slice(0, 3)).toEqual(['2026-11-14', 's1', 'Mon · Upper A']);
    expect(row[3]).toBe('17:30');
    expect(row[4]).toBe(60);
    expect(row[5]).toBe(3); // the exercise with no sets is not counted
    expect(row[6]).toBe(8);
    expect(row[7]).toBe(42 * (12 + 11 + 10 + 9) + 15 * 10 + 15 * 9 + 12.5 * 11);
  });
});
