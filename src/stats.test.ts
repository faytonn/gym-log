import { describe, expect, it } from 'vitest';
import { findRecords, weekSummary } from './stats';
import type { LoadKind, Session } from './types';

const DAY = 86_400_000;
const monday = new Date(2026, 10, 9, 18, 0).getTime(); // Mon 9 Nov 2026, 18:00

function workout(id: string, finishedAt: number, entries: [name: string, kind: LoadKind, weight: number, reps: number[]][]): Session {
  return {
    id,
    dayId: 'd',
    dayLabel: 'Mon',
    dayName: 'Upper',
    startedAt: finishedAt - 3600_000,
    finishedAt,
    synced: 0,
    entries: entries.map(([name, kind, weight, reps]) => ({ exerciseId: name, name, kind, rir: null, sets: reps.map((r) => ({ weight, reps: r })) })),
  };
}

const line = (r: { exercise: string; label: string; value: string; before: string }) => `${r.exercise} | ${r.label} | ${r.value} | ${r.before}`;

describe('findRecords', () => {
  it('has no records after a single session', () => {
    expect(findRecords([workout('a', monday, [['Lateral raise', 'weight', 5, [12, 12, 11]]])])).toEqual([]);
  });

  it('finds more reps at the same weight, without repeating it as a 1RM record', () => {
    const r = findRecords([
      workout('a', monday, [['Lateral raise', 'weight', 5, [12, 12, 11]]]),
      workout('b', monday + DAY, [['Lateral raise', 'weight', 5, [14, 13, 12]]]),
    ]).map(line);
    expect(r).toEqual(['Lateral raise | Reps at 5 kg | 14 reps | 12 reps']);
  });

  it('finds a weight record even when reps drop', () => {
    const r = findRecords([
      workout('a', monday, [['Incline DB press', 'weight', 12.5, [12, 12, 12]]]),
      workout('b', monday + DAY, [['Incline DB press', 'weight', 15, [8, 8, 8]]]),
    ]).map(line);
    expect(r).toContain('Incline DB press | Weight | 15 kg | 12.5 kg');
  });

  it('reports a 1RM record when a lighter set beats the estimate without a weight or reps record', () => {
    const r = findRecords([
      workout('a', monday, [['Leg press', 'weight', 100, [8]]]),
      {
        ...workout('b', monday + DAY, [['Leg press', 'weight', 100, [8]]]),
        entries: [{ exerciseId: 'Leg press', name: 'Leg press', kind: 'weight', rir: null, sets: [{ weight: 100, reps: 8 }, { weight: 90, reps: 20 }] }],
      },
    ]).map(line);
    expect(r).toEqual(['Leg press | Est. 1RM | 150 kg | 126.7 kg']);
  });

  it('does not count a repeat of the best as a record', () => {
    const same = [['Leg curl', 'weight', 39, [12, 11]]] as [string, LoadKind, number, number[]][];
    expect(findRecords([workout('a', monday, same), workout('b', monday + DAY, same)])).toEqual([]);
  });

  it('assisted work: less assist is the record, and no 1RM estimate', () => {
    const r = findRecords([
      workout('a', monday, [['Assisted pull-up', 'assist', 35, [10, 9]]]),
      workout('b', monday + DAY, [['Assisted pull-up', 'assist', 32.5, [7, 6]]]),
    ]).map(line);
    expect(r).toEqual(['Assisted pull-up | Less assist | 32.5 kg | 35 kg']);
  });

  it('bodyweight work: most reps is the record', () => {
    const r = findRecords([
      workout('a', monday, [['Hanging knee/leg raise', 'bodyweight', 0, [10, 10]]]),
      workout('b', monday + DAY, [['Hanging knee/leg raise', 'bodyweight', 0, [12, 9]]]),
    ]).map(line);
    expect(r).toEqual(['Hanging knee/leg raise | Reps | 12 reps | 10 reps']);
  });

  it('shares history across days by exercise name and returns oldest first', () => {
    const r = findRecords([
      workout('c', monday + 2 * DAY, [['lateral raise', 'weight', 6, [12]]]),
      workout('a', monday, [['Lateral raise', 'weight', 5, [12]]]),
      workout('b', monday + DAY, [['Lateral raise', 'weight', 5, [13]]]),
    ]);
    expect(r.map((x) => x.label)).toEqual(['Reps at 5 kg', 'Weight']);
    expect(r[0].at).toBeLessThan(r[1].at);
  });
});

describe('weekSummary', () => {
  it('counts workouts and sets since Monday and marks the days trained', () => {
    const sessions = [
      workout('old', monday - DAY, [['Leg curl', 'weight', 39, [12, 11]]]), // Sunday of last week
      workout('a', monday, [['Leg curl', 'weight', 39, [12, 11]]]),
      workout('b', monday + 3 * DAY, [['Leg curl', 'weight', 39, [12, 11, 10]]]),
    ];
    const w = weekSummary(sessions, monday + 4 * DAY);
    expect(w.workouts).toBe(2);
    expect(w.sets).toBe(5);
    expect(w.days).toEqual([true, false, false, true, false, false, false]);
    expect(w.today).toBe(4);
  });

  it('is empty for a week with no training', () => {
    expect(weekSummary([], monday)).toMatchObject({ workouts: 0, sets: 0 });
  });
});
