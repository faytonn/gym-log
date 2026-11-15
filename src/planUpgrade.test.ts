import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, loadPlan } from './db';
import { SUPERSEDED_DEFAULTS, isSupersededDefault, planSignature, seedPlan } from './seed';
import { seedPlanV1 } from './testdata/planV1';
import type { Plan } from './types';

const friday = (p: Plan) => p.days.find((d) => d.label === 'Fri')!.exercises.map((e) => e.name);

describe('upgrading a saved default plan', () => {
  beforeEach(() => db.kv.clear());

  it('knows the first default plan by its signature, and not the current one', () => {
    expect(SUPERSEDED_DEFAULTS).toContain(planSignature(seedPlanV1()));
    expect(isSupersededDefault(seedPlan())).toBe(false);
  });

  it('replaces an unedited first default with the current default', async () => {
    await db.kv.put({ key: 'plan', value: seedPlanV1() });
    const plan = await loadPlan();
    expect(friday(plan)).toEqual(['Hip thrust', 'Bulgarian split squat', 'Leg curl', 'Straight-arm cable pulldown', 'Low-to-high cable fly', 'Hanging knee/leg raise']);
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

  it('leaves a plan alone once anything in it was edited', async () => {
    const edits: ((p: Plan) => void)[] = [
      (p) => (p.days[0].exercises[0].note = 'my own note'),
      (p) => (p.days[0].exercises[0].sets = 4),
      (p) => p.days[3].exercises.pop(),
      (p) => (p.days[1].name = 'Legs'),
      (p) => (p.days[0].exercises[0].secondaryMuscles = []),
    ];
    for (const edit of edits) {
      const mine = seedPlanV1();
      edit(mine);
      await db.kv.put({ key: 'plan', value: mine });
      expect(await loadPlan()).toEqual(mine);
    }
  });

  it('keeps the current default as it is', async () => {
    const current = seedPlan();
    await db.kv.put({ key: 'plan', value: current });
    expect(await loadPlan()).toEqual(current);
  });
});
