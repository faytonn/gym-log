import { defaultMuscles } from './muscles';
import type { LoadKind, Plan, PlanDay, PlanExercise, RestType } from './types';

type Row = [
  name: string,
  sets: number,
  repMin: number,
  repMax: number,
  startWeight: number | null,
  rest: RestType,
  note: string,
  extra?: { kind?: LoadKind; increment?: number },
];

export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function day(label: string, name: string, rows: Row[]): PlanDay {
  const id = slug(`${label}-${name}`);
  return {
    id,
    label,
    name,
    exercises: rows.map(
      ([exName, sets, repMin, repMax, startWeight, rest, note, extra]): PlanExercise => ({
        id: `${id}--${slug(exName)}`,
        name: exName,
        sets,
        repMin,
        repMax,
        startWeight,
        rest,
        restSeconds: null,
        kind: extra?.kind ?? 'weight',
        increment: extra?.increment ?? 2.5,
        note,
        ...defaultMuscles(exName),
      }),
    ),
  };
}

const C: RestType = 'compound';
const I: RestType = 'isolation';

/** The default plan. Editable in Settings; this is only used on first run or "Reset plan". */
export function seedPlan(): Plan {
  return {
    days: [
      day('Mon', 'Upper A', [
        ['Incline DB press', 3, 8, 12, 12.5, C, "Per dumbbell. Bench at 30–45°, NOT 80–90° (that's a shoulder press). Shoulder blades pinned back"],
        ['Lat pulldown', 4, 8, 15, 42, C, 'Stay at 42 until all 4 sets hit 15. Then go up the smallest step the machine allows (add-on plate / half pin, ~2.5 kg), not straight to 49'],
        ['DB shoulder press', 3, 8, 12, 12.5, C, 'Per dumbbell'],
        ['Seated cable row', 3, 10, 12, 30, C, 'Form first: chest up, pull to your belly, squeeze shoulder blades, no leaning back'],
        ['Lateral raise', 3, 12, 20, 5, I, 'Per dumbbell. Strict, no swinging', { increment: 1 }],
        ['Behind-body cable curl', 3, 8, 12, 4, I, 'You use 3–5 kg. One arm at a time, facing away from the cable. Full stretch at the bottom. Log your weaker arm', { increment: 1 }],
        ['Single-arm overhead cable extension', 3, 10, 15, null, I, 'Facing away, cable behind your back. Deep stretch behind your head. Log your weaker arm', { increment: 1.25 }],
      ]),
      day('Tue', 'Lower A', [
        ['Leg press', 3, 8, 12, null, C, 'Find your weight in session 1: one that leaves 2 reps in the tank at 10', { increment: 5 }],
        ['Romanian deadlift', 3, 8, 10, 12.5, C, "Per dumbbell. You've used ~10; this lift usually climbs fast. Hips back, flat back"],
        ['Leg extension', 2, 12, 15, 55, I, 'You use 50–60 depending on the gym'],
        ['Leg curl', 2, 10, 15, 39, I, ''],
        ['Lateral raise', 2, 12, 20, 5, I, 'Side delts recover fast, so they get hit 4x a week', { increment: 1 }],
        ['Cable crunch', 3, 10, 15, 22.5, I, "You use 20–25. Curl your ribs toward your hips; don't just bow from the hips"],
      ]),
      day('Thu', 'Upper B', [
        ['Assisted pull-up', 4, 6, 10, 35, C, 'Log the assist weight: lower number = stronger', { kind: 'assist' }],
        ['Single-arm chest-supported row', 3, 10, 12, 10, C, 'Per dumbbell. Upper-back thickness. Log your weaker arm'],
        ['Machine shoulder press', 3, 8, 12, 37.5, C, "You've been using 35–40"],
        ['Pec deck / cable fly', 3, 12, 15, 28, I, 'Squeeze and hold 1s where your hands meet'],
        ['Rear delt fly', 3, 12, 15, 25, I, 'You use 25–28'],
        ['Cable lateral raise', 3, 12, 20, null, I, 'One arm at a time, cable at hand height. Smaller weight steps than dumbbells, tension the whole way. Log your weaker arm', { increment: 1.25 }],
        ['Triceps pushdown', 3, 10, 15, 14.6, I, 'Two-handle attachment. You use 14.6–17.4', { increment: 2.8 }],
        ['Machine biceps curl', 2, 10, 15, 25, I, 'Last exercise of the day. Slow on the way down'],
      ]),
      day('Fri', 'Lower B', [
        ['Hip thrust', 3, 8, 12, null, C, 'Machine or barbell. Find a weight in session 1 that leaves ~2 reps at 10. Chin tucked, ribs down, 1s squeeze at the top', { increment: 5 }],
        ['Bulgarian split squat', 3, 8, 12, null, C, 'Per dumbbell (log 0 if bodyweight). Weaker leg first, log your weaker leg. Lean slightly forward for more glutes'],
        ['Leg curl', 3, 10, 15, 39, I, 'Same machine as Tuesday, so the log is shared'],
        ['Hanging knee/leg raise', 3, 10, 15, 0, I, 'Bodyweight: log 0. Tilt your pelvis up, no swinging', { kind: 'bodyweight' }],
      ]),
      day('Sat', 'Shoulders & arms', [
        ['Lateral raise', 3, 12, 20, 5, I, "Do these first while you're fresh", { increment: 1 }],
        ['EZ bar curl', 3, 8, 12, 12.5, I, 'Plates only (6.25 per side), bar not counted'],
        ['Overhead triceps extension', 3, 10, 15, 5, I, 'Try the two-hand version with one heavier dumbbell'],
        ['Hammer curl', 3, 10, 12, 10, I, 'Per dumbbell'],
        ['Single-arm pushdown (no handle)', 3, 10, 15, null, I, 'Hold the cable ball/end. Elbow pinned to your side. Log your weaker arm', { increment: 1.25 }],
        ['Rear delt fly', 2, 12, 15, 25, I, ''],
        ['DB shrug', 3, 10, 15, null, I, 'Per dumbbell. Straight up toward your ears, 1s pause at the top, no rolling'],
      ]),
    ],
  };
}
