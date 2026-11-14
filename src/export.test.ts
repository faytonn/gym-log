import { describe, expect, it } from 'vitest';
import { SHEET_HEADER, sessionToRows, toCsv } from './export';
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
