import { db, loadPlan } from './db';
import { startOfWeek } from './muscles';
import { exerciseKey, roundKg } from './progression';
import type { LoggedSet, Plan, Session } from './types';

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Starting weights for exercises whose plan entry says "find your weight in session 1". */
const FOUND_WEIGHT: Record<string, number> = {
  'leg press': 100,
  'hip thrust': 60,
  'bulgarian split squat': 10,
  'single-arm overhead cable extension': 7.5,
  'face pull': 15,
  'cable lateral raise': 5,
  'straight-arm cable pulldown': 15,
  'low-to-high cable fly': 7.5,
  'single-arm pushdown (no handle)': 7.5,
  'db shrug': 20,
};

/** Small seeded random generator, so the sample data is the same on every device. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Sample training history for the demo: every plan day on its weekday for the last `weeks`
 * weeks up to `now`, a few missed sessions, and double progression on every exercise.
 */
export function demoSessions(plan: Plan, now: number, weeks = 8, seed = 7): Session[] {
  const rand = random(seed);
  const state = new Map<string, { weight: number; base: number }>();
  const sessions: Session[] = [];
  const first = startOfWeek(now) - (weeks - 1) * 7 * 86_400_000;

  for (let day = new Date(first); day.getTime() <= now; day.setDate(day.getDate() + 1)) {
    for (const planDay of plan.days.filter((d) => WEEKDAY[d.label] === day.getDay())) {
      const finished = new Date(day);
      finished.setHours(18, Math.floor(rand() * 50), 0, 0);
      const finishedAt = finished.getTime();
      if (finishedAt > now) continue;
      if (rand() < 0.08) continue; // a missed session now and then

      const entries = planDay.exercises.map((ex) => {
        const key = exerciseKey(ex.name);
        const st = state.get(key) ?? { weight: ex.kind === 'bodyweight' ? 0 : (ex.startWeight ?? FOUND_WEIGHT[key] ?? 10), base: ex.repMin + 1 };
        const sets: LoggedSet[] = Array.from({ length: ex.sets }, (_, i) => {
          const drop = i === 0 ? 0 : Math.floor(i * (0.3 + rand() * 0.7));
          return { weight: st.weight, reps: Math.max(ex.repMin - 1, Math.min(ex.repMax, st.base - drop)) };
        });

        // Double progression: top of the range on every set -> load up and start low again.
        if (Math.min(...sets.map((s) => s.reps)) >= ex.repMax) {
          if (ex.kind === 'weight') st.weight = roundKg(st.weight + ex.increment);
          if (ex.kind === 'assist') st.weight = roundKg(Math.max(0, st.weight - ex.increment));
          st.base = ex.kind === 'bodyweight' ? ex.repMax : ex.repMin + 1;
        } else if (rand() < 0.75) {
          st.base += 1;
        }
        state.set(key, st);
        return { exerciseId: ex.id, name: ex.name, kind: ex.kind, sets, rir: 1 + Math.floor(rand() * 3) };
      });

      sessions.push({
        id: `demo-${sessions.length + 1}`,
        dayId: planDay.id,
        dayLabel: planDay.label,
        dayName: planDay.name,
        startedAt: finishedAt - (45 + Math.floor(rand() * 25)) * 60_000,
        finishedAt,
        entries,
        synced: 1,
      });
    }
  }
  return sessions;
}

const SEEDED_AT = 'demoSeededAt';
const REFRESH_MS = 3 * 86_400_000;

/**
 * Fills the demo database with sample workouts. Runs again after a few days so the dashboard
 * always shows a current week, or at once with `force`.
 */
export async function seedDemo(force = false): Promise<void> {
  const row = await db.kv.get(SEEDED_AT);
  const seededAt = typeof row?.value === 'number' ? row.value : 0;
  if (!force && Date.now() - seededAt < REFRESH_MS) return;
  const plan = await loadPlan();
  const sessions = demoSessions(plan, Date.now());
  await db.transaction('rw', db.sessions, db.kv, async () => {
    await db.sessions.clear();
    await db.kv.delete('active');
    await db.sessions.bulkPut(sessions);
    await db.kv.put({ key: SEEDED_AT, value: Date.now() });
  });
}
