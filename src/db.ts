import Dexie, { type Table } from 'dexie';
import { withMuscles } from './muscles';
import { seedPlan } from './seed';
import { DEFAULT_SETTINGS, type ActiveSession, type Plan, type Session, type Settings } from './types';

interface KV {
  key: string;
  value: unknown;
}

class GymDB extends Dexie {
  sessions!: Table<Session, string>;
  kv!: Table<KV, string>;

  constructor() {
    super('gym-log');
    this.version(1).stores({
      sessions: 'id, finishedAt, synced',
      kv: 'key',
    });
  }
}

export const db = new GymDB();

const PLAN = 'plan';
const SETTINGS = 'settings';
const ACTIVE = 'active';

export async function loadPlan(): Promise<Plan> {
  const row = await db.kv.get(PLAN);
  if (row) {
    // Plans saved before muscle data existed get the default mapping once.
    const stored = row.value as Plan;
    const plan = withMuscles(stored);
    if (plan !== stored) await db.kv.put({ key: PLAN, value: plan });
    return plan;
  }
  const plan = seedPlan();
  await db.kv.put({ key: PLAN, value: plan });
  return plan;
}

export function savePlan(plan: Plan): Promise<string> {
  return db.kv.put({ key: PLAN, value: plan });
}

export async function loadSettings(): Promise<Settings> {
  const row = await db.kv.get(SETTINGS);
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) };
}

export function saveSettings(settings: Settings): Promise<string> {
  return db.kv.put({ key: SETTINGS, value: settings });
}

export async function loadActive(): Promise<ActiveSession | null> {
  const row = await db.kv.get(ACTIVE);
  return (row?.value as ActiveSession) ?? null;
}

export function saveActive(active: ActiveSession): Promise<string> {
  return db.kv.put({ key: ACTIVE, value: active });
}

export function clearActive(): Promise<void> {
  return db.kv.delete(ACTIVE);
}

/** Stores the finished session and clears the in-progress one in a single transaction. */
export function commitSession(session: Session): Promise<void> {
  return db.transaction('rw', db.sessions, db.kv, async () => {
    await db.sessions.put(session);
    await db.kv.delete(ACTIVE);
  });
}

export function pendingSessions(): Promise<Session[]> {
  return db.sessions.where('synced').equals(0).sortBy('finishedAt');
}

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
