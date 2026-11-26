import { exerciseKey } from './progression';
import type { Plan, PlanExercise } from './types';

export const MUSCLES = [
  'front-delts',
  'side-delts',
  'rear-delts',
  'upper-chest',
  'chest',
  'lats',
  'upper-back',
  'biceps',
  'brachialis',
  'forearms',
  'triceps',
  'abs',
  'obliques',
  'lower-back',
  'glutes',
  'quads',
  'hamstrings',
  'adductors',
  'hip-flexors',
  'calves',
] as const;

export type Muscle = (typeof MUSCLES)[number];

export const MUSCLE_LABEL: Record<Muscle, string> = {
  'front-delts': 'Front delts',
  'side-delts': 'Side delts',
  'rear-delts': 'Rear delts',
  'upper-chest': 'Upper chest',
  chest: 'Chest',
  lats: 'Lats',
  'upper-back': 'Upper back / traps',
  biceps: 'Biceps',
  brachialis: 'Brachialis',
  forearms: 'Forearms',
  triceps: 'Triceps',
  abs: 'Abs',
  obliques: 'Obliques',
  'lower-back': 'Lower back',
  glutes: 'Glutes',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  adductors: 'Adductors',
  'hip-flexors': 'Hip flexors',
  calves: 'Calves',
};

export interface MuscleTargets {
  primaryMuscles: Muscle[];
  secondaryMuscles: Muscle[];
}

const m = (primaryMuscles: Muscle[], secondaryMuscles: Muscle[] = []): MuscleTargets => ({ primaryMuscles, secondaryMuscles });

/** Default muscle mapping by exercise name. Used for the seed plan and to fill in plans saved before muscles existed. */
const DEFAULTS: Record<string, MuscleTargets> = {
  'incline db press': m(['upper-chest'], ['front-delts', 'triceps']),
  'lat pulldown': m(['lats'], ['biceps', 'rear-delts', 'upper-back']),
  'neutral-grip lat pulldown': m(['lats'], ['biceps', 'brachialis', 'upper-back']),
  'db shoulder press': m(['front-delts'], ['side-delts', 'triceps']),
  'machine shoulder press': m(['front-delts'], ['side-delts', 'triceps']),
  'hammer strength shoulder press': m(['front-delts'], ['side-delts', 'triceps']),
  'seated cable row': m(['upper-back', 'lats'], ['biceps', 'rear-delts']),
  'wide-grip cable row': m(['upper-back'], ['rear-delts', 'lats', 'biceps']),
  'face pull': m(['rear-delts', 'upper-back']),
  '45° back extension': m(['glutes', 'hamstrings'], ['lower-back']),
  'straight-arm cable pulldown': m(['lats']),
  'low-to-high cable fly': m(['upper-chest'], ['front-delts']),
  'single-arm chest-supported row': m(['upper-back', 'lats'], ['rear-delts', 'biceps']),
  'one-arm dumbbell row': m(['upper-back', 'lats'], ['rear-delts', 'biceps']),
  'assisted pull-up': m(['lats'], ['biceps', 'upper-back']),
  'lateral raise': m(['side-delts'], ['upper-back']),
  'cable lateral raise': m(['side-delts'], ['upper-back']),
  'rear delt fly': m(['rear-delts'], ['upper-back']),
  'pec deck / cable fly': m(['chest'], ['front-delts']),
  'machine chest press': m(['chest'], ['front-delts', 'triceps']),
  'behind-body cable curl': m(['biceps'], ['forearms']),
  'ez bar curl': m(['biceps'], ['brachialis', 'forearms']),
  'machine biceps curl': m(['biceps']),
  'hammer curl': m(['brachialis'], ['biceps', 'forearms']),
  'triceps pushdown': m(['triceps']),
  'single-arm pushdown (no handle)': m(['triceps']),
  'overhead triceps extension': m(['triceps']),
  'single-arm overhead cable extension': m(['triceps']),
  'leg press': m(['quads'], ['glutes', 'adductors']),
  'bulgarian split squat': m(['quads', 'glutes'], ['adductors']),
  'romanian deadlift': m(['hamstrings', 'glutes'], ['lower-back']),
  'hip thrust': m(['glutes'], ['hamstrings']),
  'leg extension': m(['quads']),
  'leg curl': m(['hamstrings']),
  'cable crunch': m(['abs'], ['obliques']),
  'hanging knee/leg raise': m(['abs'], ['obliques', 'hip-flexors']),
  'db shrug': m(['upper-back'], ['forearms']),
};

export function defaultMuscles(name: string): MuscleTargets {
  const d = DEFAULTS[exerciseKey(name)];
  return d ? { primaryMuscles: [...d.primaryMuscles], secondaryMuscles: [...d.secondaryMuscles] } : m([]);
}

/** Fills in muscles for exercises saved before the field existed. Returns the same object if nothing changed. */
export function withMuscles(plan: Plan): Plan {
  let changed = false;
  const days = plan.days.map((d) => ({
    ...d,
    exercises: d.exercises.map((ex) => {
      if (Array.isArray(ex.primaryMuscles) && Array.isArray(ex.secondaryMuscles)) return ex;
      changed = true;
      return { ...ex, ...defaultMuscles(ex.name) };
    }),
  }));
  return changed ? { days } : plan;
}

// ---------- weekly volume ----------

export type Volume = Record<Muscle, number>;

export const PRIMARY_WEIGHT = 1;
export const SECONDARY_WEIGHT = 0.5;

export function emptyVolume(): Volume {
  return Object.fromEntries(MUSCLES.map((x) => [x, 0])) as Volume;
}

export interface VolumeItem extends MuscleTargets {
  sets: number;
}

/** Hard sets per muscle: each set counts 1 for a primary muscle and 0.5 for a secondary one. */
export function weeklyVolume(items: VolumeItem[]): Volume {
  const v = emptyVolume();
  for (const it of items) {
    if (it.sets <= 0) continue;
    // A muscle listed as both primary and secondary counts once, as primary.
    const primary = new Set(it.primaryMuscles);
    for (const mu of primary) v[mu] += it.sets * PRIMARY_WEIGHT;
    for (const mu of new Set(it.secondaryMuscles)) if (!primary.has(mu)) v[mu] += it.sets * SECONDARY_WEIGHT;
  }
  return v;
}

/** Planned weekly volume: every day of the plan once (one rotation = one week). */
export function planVolume(plan: Plan): Volume {
  return weeklyVolume(plan.days.flatMap((d) => d.exercises.map((ex) => ({ ...ex, sets: ex.sets }))));
}

/** Monday 00:00 local time of the week containing `now`. */
export function startOfWeek(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const sinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - sinceMonday);
  return d.getTime();
}

export interface LoggedItem {
  name: string;
  sets: number;
  at: number;
}

/**
 * Logged volume since `weekStart`. Muscles come from the current plan, matched by exercise name,
 * so fixing a mapping in Settings also fixes past weeks. Unknown names fall back to the defaults.
 */
export function loggedVolume(items: LoggedItem[], plan: Plan, weekStart: number): Volume {
  const targets = targetsLookup(plan);
  return weeklyVolume(items.filter((it) => it.at >= weekStart).map((it) => ({ ...targets(it.name), sets: it.sets })));
}

export type VolumeBand = 'none' | 'light' | 'medium' | 'strong';

/** 0–4 grey, 5–9 light, 10–15 medium, 16+ strong. Half sets round down into the lower band. */
export function volumeBand(sets: number): VolumeBand {
  if (sets < 5) return 'none';
  if (sets < 10) return 'light';
  if (sets < 16) return 'medium';
  return 'strong';
}

export function sortedVolume(v: Volume): [Muscle, number][] {
  return MUSCLES.map((mu) => [mu, v[mu]] as [Muscle, number]).sort((a, b) => b[1] - a[1] || MUSCLES.indexOf(a[0]) - MUSCLES.indexOf(b[0]));
}

export function targetsOf(ex: Pick<PlanExercise, 'primaryMuscles' | 'secondaryMuscles'>): MuscleTargets {
  return { primaryMuscles: ex.primaryMuscles ?? [], secondaryMuscles: ex.secondaryMuscles ?? [] };
}

/** Muscles for an exercise name: the current plan first, then the default mapping. */
export function targetsLookup(plan: Plan): (name: string) => MuscleTargets {
  const byName = new Map<string, MuscleTargets>();
  for (const d of plan.days) for (const ex of d.exercises) if (!byName.has(exerciseKey(ex.name))) byName.set(exerciseKey(ex.name), targetsOf(ex));
  return (name) => byName.get(exerciseKey(name)) ?? defaultMuscles(name);
}
