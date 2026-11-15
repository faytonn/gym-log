import { describe, expect, it } from 'vitest';
import { exerciseKey, findLastEntry, nextDayId, nextHint, roundKg, sessionScore, setDelta, trendFor, workingWeight } from './progression';
import type { LoggedSet, PlanExercise, Session, SessionEntry } from './types';

type Ex = Pick<PlanExercise, 'repMin' | 'repMax' | 'kind' | 'increment'>;
const weighted: Ex = { repMin: 8, repMax: 12, kind: 'weight', increment: 2.5 };
const sets = (w: number, ...reps: number[]): LoggedSet[] => reps.map((r) => ({ weight: w, reps: r }));

function session(id: string, finishedAt: number, entries: Partial<SessionEntry>[], dayId = 'mon'): Session {
  return {
    id,
    dayId,
    dayLabel: 'Mon',
    dayName: 'Upper A',
    startedAt: finishedAt - 3600_000,
    finishedAt,
    synced: 0,
    entries: entries.map((e) => ({ exerciseId: 'x', name: 'x', kind: 'weight', sets: [], rir: null, ...e })),
  };
}

describe('nextHint: double progression', () => {
  it('first session when never logged', () => {
    const h = nextHint(weighted, null);
    expect(h.kind).toBe('first');
    expect(h.text).toBe('First session: find your weight');
    expect(h.suggestedWeight).toBeNull();
  });

  it('treats an entry with no sets as never logged', () => {
    expect(nextHint(weighted, { sets: [] }).kind).toBe('first');
  });

  it('adds weight when the lowest-rep set hit the top of the range', () => {
    const h = nextHint(weighted, { sets: sets(12.5, 12, 12, 12) });
    expect(h.kind).toBe('add-weight');
    expect(h.text).toBe('Add weight (smallest jump)');
    expect(h.suggestedWeight).toBe(15);
    expect(h.detail).toBe('12.5 → 15 kg');
  });

  it('also adds weight when sets go above the top of the range', () => {
    expect(nextHint(weighted, { sets: sets(20, 14, 13, 12) }).kind).toBe('add-weight');
  });

  it('keeps weight and adds a rep when any set is below the top', () => {
    const h = nextHint(weighted, { sets: sets(12.5, 12, 12, 11) });
    expect(h.kind).toBe('add-rep');
    expect(h.text).toBe('Same weight, +1 rep');
    expect(h.suggestedWeight).toBeNull();
    expect(h.detail).toBe('Aim 12 · 12 · 12');
  });

  it('targets the first lowest set when there are ties', () => {
    expect(nextHint(weighted, { sets: sets(10, 9, 8, 8) }).detail).toBe('Aim 9 · 9 · 8');
  });

  it('lat pulldown stays at 42 until all 4 sets hit 15', () => {
    const lat: Ex = { repMin: 8, repMax: 15, kind: 'weight', increment: 2.5 };
    expect(nextHint(lat, { sets: sets(42, 15, 15, 15, 14) }).kind).toBe('add-rep');
    const up = nextHint(lat, { sets: sets(42, 15, 15, 15, 15) });
    expect(up.kind).toBe('add-weight');
    expect(up.suggestedWeight).toBe(44.5);
  });

  it('uses the exercise increment and rounds float noise', () => {
    const pushdown: Ex = { repMin: 10, repMax: 15, kind: 'weight', increment: 2.8 };
    expect(nextHint(pushdown, { sets: sets(14.6, 15, 15, 15) }).suggestedWeight).toBe(17.4);
  });

  it('assisted pull-up: says "Less assist" and lowers the number', () => {
    const pullup: Ex = { repMin: 6, repMax: 10, kind: 'assist', increment: 2.5 };
    const h = nextHint(pullup, { sets: sets(35, 10, 10, 10, 10) });
    expect(h.kind).toBe('less-assist');
    expect(h.text).toBe('Less assist');
    expect(h.text).not.toContain('Add weight');
    expect(h.suggestedWeight).toBe(32.5);
  });

  it('assisted pull-up never suggests negative assist', () => {
    const pullup: Ex = { repMin: 6, repMax: 10, kind: 'assist', increment: 5 };
    expect(nextHint(pullup, { sets: sets(2.5, 10, 10) }).suggestedWeight).toBe(0);
  });

  it('assisted pull-up below the top keeps the assist', () => {
    const pullup: Ex = { repMin: 6, repMax: 10, kind: 'assist', increment: 2.5 };
    const h = nextHint(pullup, { sets: sets(35, 10, 9, 8, 7) });
    expect(h.kind).toBe('add-rep');
    expect(h.text).toBe('Same assist, +1 rep');
  });

  it('hanging knee/leg raise: "Make it harder (straighter legs)" instead of adding weight', () => {
    const raise: Ex = { repMin: 10, repMax: 15, kind: 'bodyweight', increment: 2.5 };
    const h = nextHint(raise, { sets: sets(0, 15, 15, 15) });
    expect(h.kind).toBe('harder');
    expect(h.text).toBe('Make it harder (straighter legs)');
    expect(h.suggestedWeight).toBeNull();
  });

  it('hanging raise below the top adds a rep', () => {
    const raise: Ex = { repMin: 10, repMax: 15, kind: 'bodyweight', increment: 2.5 };
    expect(nextHint(raise, { sets: sets(0, 15, 12, 11) }).kind).toBe('add-rep');
  });

  it('uses the weight from most sets when one set was dropped', () => {
    const h = nextHint(weighted, { sets: [{ weight: 20, reps: 12 }, { weight: 20, reps: 12 }, { weight: 17.5, reps: 12 }] });
    expect(h.suggestedWeight).toBe(22.5);
  });
});

describe('workingWeight', () => {
  it('returns null for no sets', () => expect(workingWeight([])).toBeNull());
  it('ties go to the first set', () => expect(workingWeight([{ weight: 10, reps: 8 }, { weight: 12, reps: 8 }])).toBe(10));
});

describe('roundKg', () => {
  it('rounds to 2 decimals', () => expect(roundKg(14.6 + 2.8)).toBe(17.4));
});

describe('findLastEntry: history shared by exercise name', () => {
  it('finds lateral raise from another day', () => {
    const sessions = [
      session('a', 1000, [{ name: 'Lateral raise', sets: sets(5, 12, 12, 12) }], 'mon'),
      session('b', 2000, [{ name: 'Lateral raise', sets: sets(5, 15, 14) }], 'tue'),
    ];
    const last = findLastEntry(sessions, 'Lateral raise');
    expect(last?.session.id).toBe('b');
    expect(last?.entry.sets.map((s) => s.reps)).toEqual([15, 14]);
  });

  it('matches names ignoring case and extra spaces', () => {
    const sessions = [session('a', 1000, [{ name: 'Leg  curl ', sets: sets(39, 10) }])];
    expect(findLastEntry(sessions, 'leg curl')?.session.id).toBe('a');
    expect(exerciseKey(' Leg  Curl')).toBe('leg curl');
  });

  it('skips sessions where the exercise has no sets', () => {
    const sessions = [
      session('a', 1000, [{ name: 'Leg curl', sets: sets(39, 10) }]),
      session('b', 2000, [{ name: 'Leg curl', sets: [] }]),
    ];
    expect(findLastEntry(sessions, 'Leg curl')?.session.id).toBe('a');
  });

  it('does not depend on array order', () => {
    const sessions = [
      session('new', 3000, [{ name: 'Leg curl', sets: sets(41, 10) }]),
      session('old', 1000, [{ name: 'Leg curl', sets: sets(39, 10) }]),
    ];
    expect(findLastEntry(sessions, 'Leg curl')?.session.id).toBe('new');
  });

  it('can exclude a session', () => {
    const sessions = [session('a', 1000, [{ name: 'Leg curl', sets: sets(39, 10) }])];
    expect(findLastEntry(sessions, 'Leg curl', 'a')).toBeNull();
  });

  it('returns null when never logged', () => {
    expect(findLastEntry([], 'DB shrug')).toBeNull();
  });
});

describe('nextDayId: rotation', () => {
  const days = ['mon', 'tue', 'thu', 'fri', 'sat'];
  it('starts with the first day', () => expect(nextDayId(days, [])).toBe('mon'));
  it('goes to the day after the latest session', () => {
    expect(nextDayId(days, [{ dayId: 'mon', finishedAt: 1 }, { dayId: 'thu', finishedAt: 5 }])).toBe('fri');
  });
  it('wraps around', () => expect(nextDayId(days, [{ dayId: 'sat', finishedAt: 1 }])).toBe('mon'));
  it('falls back to the first day if the last day was deleted from the plan', () => {
    expect(nextDayId(days, [{ dayId: 'gone', finishedAt: 1 }])).toBe('mon');
  });
  it('handles an empty plan', () => expect(nextDayId([], [])).toBeNull());
});

describe('setDelta', () => {
  it('has nothing to compare on a first session', () => expect(setDelta('weight', { weight: 5, reps: 12 }, undefined)).toBeNull());
  it('compares reps at the same weight', () => {
    expect(setDelta('weight', { weight: 5, reps: 16 }, { weight: 5, reps: 15 })).toEqual({ text: '+1', better: true });
    expect(setDelta('weight', { weight: 5, reps: 13 }, { weight: 5, reps: 15 })).toEqual({ text: '−2', better: false });
    expect(setDelta('weight', { weight: 5, reps: 15 }, { weight: 5, reps: 15 })).toEqual({ text: '=', better: false });
  });
  it('shows the weight change when the weight differs', () => {
    expect(setDelta('weight', { weight: 15, reps: 8 }, { weight: 12.5, reps: 12 })).toEqual({ text: '+2.5kg', better: true });
  });
  it('less assist is better', () => {
    expect(setDelta('assist', { weight: 32.5, reps: 6 }, { weight: 35, reps: 10 })).toEqual({ text: '−2.5kg', better: true });
    expect(setDelta('assist', { weight: 40, reps: 10 }, { weight: 35, reps: 10 })?.better).toBe(false);
  });
});

describe('sessionScore and trendFor', () => {
  it('goes up with more reps and with more weight', () => {
    const base = sessionScore('weight', sets(10, 10, 9));
    expect(sessionScore('weight', sets(10, 11, 9))).toBeGreaterThan(base);
    expect(sessionScore('weight', sets(12.5, 10, 9))).toBeGreaterThan(base);
  });
  it('goes up when the assist goes down', () => {
    expect(sessionScore('assist', sets(30, 8))).toBeGreaterThan(sessionScore('assist', sets(35, 8)));
  });
  it('uses reps for bodyweight work', () => {
    expect(sessionScore('bodyweight', sets(0, 15))).toBeGreaterThan(sessionScore('bodyweight', sets(0, 12)));
  });
  it('returns the latest sessions oldest first, across days', () => {
    const sessions = [
      session('c', 3000, [{ name: 'Lateral raise', sets: sets(5, 15) }], 'sat'),
      session('a', 1000, [{ name: 'Lateral raise', sets: sets(5, 12) }], 'mon'),
      session('b', 2000, [{ name: 'Lateral raise', sets: sets(5, 14) }], 'tue'),
      session('x', 2500, [{ name: 'Leg curl', sets: sets(39, 10) }], 'tue'),
    ];
    const t = trendFor(sessions, 'Lateral raise', 'weight');
    expect(t).toHaveLength(3);
    expect(t[0]).toBeLessThan(t[1]);
    expect(t[1]).toBeLessThan(t[2]);
    expect(trendFor(sessions, 'Lateral raise', 'weight', 2)).toEqual(t.slice(1));
  });
});
