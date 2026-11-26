import type { Muscle } from './muscles';
import { exerciseKey } from './progression';
import { LEG_DAY_ID, UPPER_C_ID, seedPlan, slug } from './seed';
import type { Plan, PlanDay, PlanExercise } from './types';

const LEG_MUSCLES: ReadonlySet<Muscle> = new Set<Muscle>(['glutes', 'quads', 'hamstrings', 'adductors', 'calves']);

/** A leg exercise is one whose primary muscles are all leg muscles. Hanging leg raises (abs) are not. */
export function isLegExercise(ex: Pick<PlanExercise, 'primaryMuscles'>): boolean {
  const primary = ex.primaryMuscles ?? [];
  return primary.length > 0 && primary.every((mu) => LEG_MUSCLES.has(mu));
}

const named = (ex: PlanExercise, key: string) => exerciseKey(ex.name) === key;

/** The two exercises that turn Friday into an upper day. */
const NEW_ON_FRIDAY = ['neutral-grip lat pulldown', 'machine chest press'];

/**
 * One leg day a week instead of two (2026-11-26), for a plan that was edited in Settings and so
 * is not replaced by the new default.
 *
 * - "Lower B" loses its leg exercises, gains the two new upper exercises at the top and becomes
 *   "Upper C". Everything else on that day stays as it was edited.
 * - The other leg day gets the hip thrust (the one from Lower B if there was one) after the RDL,
 *   and leg extension and leg curl go from 2 sets to 3. "Lower A" becomes "Legs".
 *
 * Returns the same object when there is nothing to do: no day still called "Lower B" with leg
 * exercises on it, or no other leg day to keep.
 */
export function toOneLegDay(plan: Plan): Plan {
  const lowerB = plan.days.find((d) => exerciseKey(d.name) === 'lower b');
  if (!lowerB || !lowerB.exercises.some(isLegExercise)) return plan;
  const legDay =
    plan.days.find((d) => d !== lowerB && exerciseKey(d.name) === 'lower a') ??
    plan.days.find((d) => d !== lowerB && d.exercises.filter(isLegExercise).length >= 2);
  if (!legDay) return plan;

  const current = seedPlan();
  const seedLegs = current.days.find((d) => d.id === LEG_DAY_ID)!;
  const seedFriday = current.days.find((d) => d.id === UPPER_C_ID)!;

  const kept = lowerB.exercises.filter((ex) => !isLegExercise(ex));
  const added = seedFriday.exercises
    .filter((ex) => NEW_ON_FRIDAY.includes(exerciseKey(ex.name)) && !kept.some((k) => named(k, exerciseKey(ex.name))))
    .map((ex) => ({ ...ex, id: `${lowerB.id}--${slug(ex.name)}` }));
  const friday: PlanDay = { ...lowerB, name: 'Upper C', exercises: [...added, ...kept] };

  const legExercises = legDay.exercises.map((ex) => ((named(ex, 'leg extension') || named(ex, 'leg curl')) && ex.sets === 2 ? { ...ex, sets: 3 } : ex));
  if (!legExercises.some((ex) => named(ex, 'hip thrust'))) {
    const base = lowerB.exercises.find((ex) => named(ex, 'hip thrust')) ?? seedLegs.exercises.find((ex) => named(ex, 'hip thrust'))!;
    let after = legExercises.findIndex((ex) => named(ex, 'romanian deadlift'));
    if (after === -1) after = legExercises.findIndex((ex) => named(ex, 'leg press'));
    legExercises.splice(after + 1, 0, { ...base, id: `${legDay.id}--hip-thrust` });
  }
  const legs: PlanDay = { ...legDay, name: exerciseKey(legDay.name) === 'lower a' ? 'Legs' : legDay.name, exercises: legExercises };

  return { days: plan.days.map((d) => (d === lowerB ? friday : d === legDay ? legs : d)) };
}
