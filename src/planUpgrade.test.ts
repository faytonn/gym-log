import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, loadPlan } from './db';
import { SUPERSEDED_DEFAULTS, isSupersededDefault, planSignature, seedPlan } from './seed';
import { isLegExercise, toOneLegDay } from './planMigration';
import { seedPlanV1 } from './testdata/planV1';
import { seedPlanV2 } from './testdata/planV2';
import type { Plan } from './types';

const names = (p: Plan, label: string) => p.days.find((d) => d.label === label)!.exercises.map((e) => e.name);
const friday = (p: Plan) => names(p, 'Fri');
const NEW_FRIDAY = ['Neutral-grip lat pulldown', 'Machine chest press', 'Straight-arm cable pulldown', 'Low-to-high cable fly', 'Hanging knee/leg raise'];
const NEW_TUESDAY = ['Leg press', 'Romanian deadlift', 'Hip thrust', 'Leg extension', 'Leg curl', '45° back extension', 'Lateral raise', 'Cable crunch'];

describe('upgrading a saved default plan', () => {
  beforeEach(() => db.kv.clear());

  it('knows the first default plan by its signature, and not the current one', () => {
    expect(SUPERSEDED_DEFAULTS).toContain(planSignature(seedPlanV1()));
    expect(isSupersededDefault(seedPlan())).toBe(false);
  });

  it('replaces an unedited first default with the current default', async () => {
    await db.kv.put({ key: 'plan', value: seedPlanV1() });
    const plan = await loadPlan();
    expect(friday(plan)).toEqual(NEW_FRIDAY);
    expect(plan.days[0].exercises.map((e) => e.name)).toContain('Face pull');
    expect(((await db.kv.get('plan'))!.value as Plan).days[0].exercises.map((e) => e.name)).toContain('Wide-grip cable row');
  });

  it('also upgrades the first default saved before muscle data existed', async () => {
    const old = seedPlanV1();
    for (const d of old.days) for (const e of d.exercises) {
      delete (e as Partial<typeof e>).primaryMuscles;
      delete (e as Partial<typeof e>).secondaryMuscles;
    }
    await db.kv.put({ key: 'plan', value: old });
    expect(friday(await loadPlan())).toContain('Low-to-high cable fly');
  });

  it('does not replace a plan once anything in it was edited', async () => {
    const edits: ((p: Plan) => void)[] = [
      (p) => (p.days[0].exercises[0].note = 'my own note'),
      (p) => (p.days[0].exercises[0].sets = 4),
      (p) => p.days[3].exercises.pop(),
      (p) => (p.days[1].name = 'Legs'),
      (p) => (p.days[0].exercises[0].secondaryMuscles = []),
    ];
    for (const edit of edits) {
      await db.kv.clear();
      const mine = seedPlanV1();
      edit(mine);
      await db.kv.put({ key: 'plan', value: mine });
      // The edit survives; the only change is the one-time move to one leg day.
      const loaded = await loadPlan();
      expect(loaded).toEqual(toOneLegDay(mine));
      expect(loaded.days[0]).toEqual(mine.days[0]);
      expect(await loadPlan()).toEqual(loaded);
    }
  });

  it('keeps the current default as it is', async () => {
    const current = seedPlan();
    await db.kv.put({ key: 'plan', value: current });
    expect(await loadPlan()).toEqual(current);
  });

  it('replaces an unedited two-leg-day default with the current default', async () => {
    expect(SUPERSEDED_DEFAULTS).toContain(planSignature(seedPlanV2()));
    await db.kv.put({ key: 'plan', value: seedPlanV2() });
    const plan = await loadPlan();
    expect(plan).toEqual(seedPlan());
    expect(names(plan, 'Tue')).toEqual(NEW_TUESDAY);
    expect(friday(plan)).toEqual(NEW_FRIDAY);
  });

  it('keeps the ids of Tuesday and Friday, so the day rotation carries on', () => {
    const ids = (p: Plan) => p.days.map((d) => d.id);
    expect(ids(seedPlan())).toEqual(ids(seedPlanV2()));
  });
});

describe('going to one leg day with an edited plan', () => {
  beforeEach(() => db.kv.clear());

  /** The two-leg-day default with the kind of edits made on the phone. */
  const edited = (): Plan => {
    const p = seedPlanV2();
    const thu = p.days.find((d) => d.label === 'Thu')!;
    thu.exercises[0] = { ...thu.exercises[0], name: 'Lat pulldown', kind: 'weight', startWeight: 42 };
    thu.exercises[2] = { ...thu.exercises[2], name: 'Iso-lateral shoulder press', sets: 3, repMin: 8, repMax: 8, startWeight: 17.5 };
    return p;
  };

  it('leaves one leg day and keeps every other edit', async () => {
    const before = edited();
    await db.kv.put({ key: 'plan', value: before });
    const plan = await loadPlan();

    expect(names(plan, 'Tue')).toEqual(NEW_TUESDAY);
    expect(friday(plan)).toEqual(NEW_FRIDAY);
    expect(plan.days.map((d) => d.name)).toEqual(['Upper A', 'Legs', 'Upper B', 'Upper C', 'Shoulders & arms']);
    expect(plan.days.map((d) => d.id)).toEqual(before.days.map((d) => d.id));
    expect(plan.days.filter((d) => d.exercises.some(isLegExercise)).map((d) => d.label)).toEqual(['Tue']);
    // The days that were not about legs are exactly as edited.
    for (const label of ['Mon', 'Thu', 'Sat']) expect(plan.days.find((d) => d.label === label)).toEqual(before.days.find((d) => d.label === label));
    expect(names(plan, 'Thu')).toContain('Iso-lateral shoulder press');
    // Saved, so the phone holds the new plan from now on.
    expect((await db.kv.get('plan'))!.value).toEqual(plan);
  });

  it('gives the leg day 3 sets of leg extension and leg curl, and the hip thrust as it was on Friday', () => {
    const before = edited();
    const fri = before.days.find((d) => d.label === 'Fri')!;
    fri.exercises[0] = { ...fri.exercises[0], startWeight: 60, note: 'barbell, pad on' };
    const tue = toOneLegDay(before).days.find((d) => d.label === 'Tue')!;
    const get = (n: string) => tue.exercises.find((e) => e.name === n)!;
    expect(get('Leg extension').sets).toBe(3);
    expect(get('Leg curl').sets).toBe(3);
    expect(get('Hip thrust')).toMatchObject({ sets: 3, startWeight: 60, note: 'barbell, pad on', id: 'tue-lower-a--hip-thrust' });
    expect(new Set(tue.exercises.map((e) => e.id)).size).toBe(tue.exercises.length);
  });

  it('keeps edits on the two days it changes', () => {
    const before = edited();
    const tue = before.days.find((d) => d.label === 'Tue')!;
    const fri = before.days.find((d) => d.label === 'Fri')!;
    tue.exercises.find((e) => e.name === 'Leg curl')!.sets = 4;
    tue.exercises = tue.exercises.filter((e) => e.name !== '45° back extension');
    fri.exercises = fri.exercises.filter((e) => e.name !== 'Low-to-high cable fly');
    fri.exercises.push({ ...fri.exercises[0], id: 'mine', name: 'Cable crunch', primaryMuscles: ['abs'], secondaryMuscles: [] });
    const after = toOneLegDay(before);
    expect(names(after, 'Tue')).toEqual(['Leg press', 'Romanian deadlift', 'Hip thrust', 'Leg extension', 'Leg curl', 'Lateral raise', 'Cable crunch']);
    expect(after.days.find((d) => d.label === 'Tue')!.exercises.find((e) => e.name === 'Leg curl')!.sets).toBe(4);
    expect(friday(after)).toEqual(['Neutral-grip lat pulldown', 'Machine chest press', 'Straight-arm cable pulldown', 'Hanging knee/leg raise', 'Cable crunch']);
  });

  it('happens once: a leg exercise put back on Friday afterwards stays', async () => {
    await db.kv.put({ key: 'plan', value: edited() });
    const plan = await loadPlan();
    const fri = plan.days.find((d) => d.label === 'Fri')!;
    fri.name = 'Lower B';
    fri.exercises.push(seedPlanV2().days.find((d) => d.label === 'Fri')!.exercises[1]);
    await db.kv.put({ key: 'plan', value: plan });
    expect(await loadPlan()).toEqual(plan);
  });

  it('leaves a plan alone when it has no day called Lower B, or no second leg day', () => {
    const renamed = edited();
    renamed.days.find((d) => d.label === 'Fri')!.name = 'Glutes';
    expect(toOneLegDay(renamed)).toBe(renamed);

    const oneLegDay = edited();
    oneLegDay.days = oneLegDay.days.filter((d) => d.label !== 'Tue');
    expect(toOneLegDay(oneLegDay)).toBe(oneLegDay);

    const current = seedPlan();
    expect(toOneLegDay(current)).toBe(current);
  });

  it('does not touch a fresh install', async () => {
    expect(await loadPlan()).toEqual(seedPlan());
    expect(await loadPlan()).toEqual(seedPlan());
  });
});
