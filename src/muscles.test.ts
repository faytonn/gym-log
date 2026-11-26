import { describe, expect, it } from 'vitest';
import {
  MUSCLES,
  defaultMuscles,
  emptyVolume,
  loggedVolume,
  planVolume,
  sortedVolume,
  startOfWeek,
  volumeBand,
  weeklyVolume,
  withMuscles,
} from './muscles';
import { seedPlan } from './seed';
import type { Plan, PlanExercise } from './types';

const ex = (name: string, sets: number, over: Partial<PlanExercise> = {}): PlanExercise => ({
  id: name,
  name,
  sets,
  repMin: 8,
  repMax: 12,
  startWeight: null,
  rest: 'isolation',
  restSeconds: null,
  kind: 'weight',
  increment: 2.5,
  note: '',
  ...defaultMuscles(name),
  ...over,
});

describe('weeklyVolume', () => {
  it('counts 1 set per primary muscle and 0.5 per secondary', () => {
    const v = weeklyVolume([{ sets: 3, primaryMuscles: ['upper-chest'], secondaryMuscles: ['front-delts', 'triceps'] }]);
    expect(v['upper-chest']).toBe(3);
    expect(v['front-delts']).toBe(1.5);
    expect(v.triceps).toBe(1.5);
    expect(v.lats).toBe(0);
  });

  it('gives every primary muscle the full set count', () => {
    const v = weeklyVolume([{ sets: 3, primaryMuscles: ['upper-back', 'lats'], secondaryMuscles: ['biceps'] }]);
    expect(v['upper-back']).toBe(3);
    expect(v.lats).toBe(3);
    expect(v.biceps).toBe(1.5);
  });

  it('adds up across exercises', () => {
    const v = weeklyVolume([
      { sets: 3, primaryMuscles: ['side-delts'], secondaryMuscles: ['upper-back'] },
      { sets: 2, primaryMuscles: ['side-delts'], secondaryMuscles: ['upper-back'] },
      { sets: 3, primaryMuscles: ['front-delts'], secondaryMuscles: ['side-delts', 'triceps'] },
    ]);
    expect(v['side-delts']).toBe(3 + 2 + 1.5);
    expect(v['upper-back']).toBe(2.5);
  });

  it('counts a muscle listed as both primary and secondary once, as primary', () => {
    const v = weeklyVolume([{ sets: 4, primaryMuscles: ['biceps'], secondaryMuscles: ['biceps', 'forearms'] }]);
    expect(v.biceps).toBe(4);
    expect(v.forearms).toBe(2);
  });

  it('ignores duplicates inside one list and zero-set items', () => {
    const v = weeklyVolume([
      { sets: 2, primaryMuscles: ['abs', 'abs'], secondaryMuscles: [] },
      { sets: 0, primaryMuscles: ['quads'], secondaryMuscles: [] },
    ]);
    expect(v.abs).toBe(2);
    expect(v.quads).toBe(0);
  });

  it('returns every muscle, zero when nothing is logged', () => {
    const v = weeklyVolume([]);
    expect(Object.keys(v).sort()).toEqual([...MUSCLES].sort());
    expect(v).toEqual(emptyVolume());
  });
});

describe('planVolume: default plan', () => {
  const v = planVolume(seedPlan());

  it('side delts: 4 lateral raise slots plus half sets from both shoulder presses', () => {
    // Lateral raise 3 + 2 + 3, cable lateral raise 3, DB press 3 × 0.5, machine press 3 × 0.5
    expect(v['side-delts']).toBe(3 + 2 + 3 + 3 + 1.5 + 1.5);
  });

  it('rear delts: both fly days, face pull, plus half sets from pulldown and rows', () => {
    // Rear delt fly 3 + 3, face pull 3, lat pulldown 4 × 0.5, wide-grip row 3 × 0.5, one-arm dumbbell row 3 × 0.5
    expect(v['rear-delts']).toBe(6 + 3 + 2 + 1.5 + 1.5);
  });

  it('front delts', () => {
    // DB press 3, machine press 3, incline press 3 × 0.5, pec deck 3 × 0.5, low-to-high fly 3 × 0.5, chest press 3 × 0.5
    expect(v['front-delts']).toBe(6 + 1.5 + 1.5 + 1.5 + 1.5);
  });

  it('hamstrings: RDL, leg curl, back extension, half sets from hip thrust', () => {
    expect(v.hamstrings).toBe(3 + 3 + 2 + 1.5);
  });

  it('legs are trained on one day only', () => {
    const legDays = seedPlan().days.filter((d) => d.exercises.some((e) => e.primaryMuscles.some((mu) => ['quads', 'hamstrings', 'glutes'].includes(mu))));
    expect(legDays.map((d) => `${d.label} ${d.name}`)).toEqual(['Tue Legs']);
  });

  it('every exercise in the default plan has a primary muscle', () => {
    for (const d of seedPlan().days) for (const e of d.exercises) expect(e.primaryMuscles.length, e.name).toBeGreaterThan(0);
  });
});

describe('loggedVolume', () => {
  const plan: Plan = { days: [{ id: 'd', label: 'Mon', name: 'Upper', exercises: [ex('Lat pulldown', 4), ex('Lateral raise', 3)] }] };
  const monday = new Date(2026, 10, 9).getTime(); // Mon 9 Nov 2026
  const DAY = 86_400_000;

  it('counts only sets logged this week', () => {
    const v = loggedVolume(
      [
        { name: 'Lat pulldown', sets: 4, at: monday + DAY },
        { name: 'Lat pulldown', sets: 4, at: monday - DAY }, // last week
      ],
      plan,
      monday,
    );
    expect(v.lats).toBe(4);
    expect(v.biceps).toBe(2);
  });

  it('counts the sets actually done, not the planned number', () => {
    const v = loggedVolume([{ name: 'Lateral raise', sets: 2, at: monday }], plan, monday);
    expect(v['side-delts']).toBe(2);
    expect(v['upper-back']).toBe(1);
  });

  it('matches by exercise name across days, ignoring case and spacing', () => {
    const v = loggedVolume([{ name: ' lateral  RAISE', sets: 3, at: monday }], plan, monday);
    expect(v['side-delts']).toBe(3);
  });

  it('uses the muscles set in the plan over the defaults', () => {
    const custom: Plan = { days: [{ ...plan.days[0], exercises: [ex('Lat pulldown', 4, { primaryMuscles: ['biceps'], secondaryMuscles: [] })] }] };
    const v = loggedVolume([{ name: 'Lat pulldown', sets: 4, at: monday }], custom, monday);
    expect(v.biceps).toBe(4);
    expect(v.lats).toBe(0);
  });

  it('falls back to the default mapping for an exercise removed from the plan', () => {
    const v = loggedVolume([{ name: 'Leg curl', sets: 3, at: monday }], plan, monday);
    expect(v.hamstrings).toBe(3);
  });

  it('counts nothing for an unknown exercise', () => {
    expect(loggedVolume([{ name: 'Mystery lift', sets: 5, at: monday }], plan, monday)).toEqual(emptyVolume());
  });
});

describe('startOfWeek', () => {
  it('is Monday 00:00 local time', () => {
    const wed = new Date(2026, 10, 11, 15, 30).getTime();
    expect(new Date(startOfWeek(wed))).toEqual(new Date(2026, 10, 9));
  });
  it('treats Sunday as the last day of the week', () => {
    const sun = new Date(2026, 10, 15, 23, 59).getTime();
    expect(new Date(startOfWeek(sun))).toEqual(new Date(2026, 10, 9));
  });
  it('keeps Monday in its own week', () => {
    const mon = new Date(2026, 10, 9, 0, 0).getTime();
    expect(startOfWeek(mon)).toBe(mon);
  });
});

describe('volumeBand', () => {
  it('0–4 grey, 5–9 light, 10–15 medium, 16+ strong', () => {
    expect([0, 4, 4.5].map(volumeBand)).toEqual(['none', 'none', 'none']);
    expect([5, 9, 9.5].map(volumeBand)).toEqual(['light', 'light', 'light']);
    expect([10, 15, 15.5].map(volumeBand)).toEqual(['medium', 'medium', 'medium']);
    expect([16, 30].map(volumeBand)).toEqual(['strong', 'strong']);
  });
});

describe('sortedVolume', () => {
  it('sorts high to low', () => {
    const v = { ...emptyVolume(), lats: 7, 'side-delts': 14, abs: 3 };
    expect(sortedVolume(v).slice(0, 3)).toEqual([
      ['side-delts', 14],
      ['lats', 7],
      ['abs', 3],
    ]);
  });
});

describe('withMuscles: plans saved before muscle data existed', () => {
  it('fills in defaults by exercise name', () => {
    const old = { days: [{ id: 'd', label: 'Mon', name: 'Upper', exercises: [{ ...ex('Hammer curl', 3), primaryMuscles: undefined, secondaryMuscles: undefined }] }] } as unknown as Plan;
    const next = withMuscles(old);
    expect(next.days[0].exercises[0].primaryMuscles).toEqual(['brachialis']);
    expect(next.days[0].exercises[0].secondaryMuscles).toEqual(['biceps', 'forearms']);
  });
  it('leaves an up-to-date plan untouched', () => {
    const plan = seedPlan();
    expect(withMuscles(plan)).toBe(plan);
  });
  it('keeps an empty list the user chose', () => {
    const plan: Plan = { days: [{ id: 'd', label: 'Mon', name: 'Upper', exercises: [ex('Lat pulldown', 4, { primaryMuscles: [], secondaryMuscles: [] })] }] };
    expect(withMuscles(plan)).toBe(plan);
  });
});
