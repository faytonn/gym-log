import { db, loadPlan, loadSettings, savePlan, saveSettings } from './db';
import { localDate } from './export';
import { exerciseKey } from './progression';
import { slug } from './seed';
import { postToScript } from './sync';
import type { LoadKind, Plan, Session, SessionEntry, Settings } from './types';

export const BACKUP_VERSION = 1;
const LAST_BACKUP = 'lastBackupAt';

/** Everything needed to rebuild the app on another phone. The sync token is a secret and is left out. */
export interface Backup {
  app: 'gym-log';
  version: number;
  exportedAt: number;
  sessions: Session[];
  plan: Plan;
  settings: Omit<Settings, 'syncToken'>;
}

export async function makeBackup(): Promise<Backup> {
  const { syncToken: _secret, ...settings } = await loadSettings();
  return {
    app: 'gym-log',
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    sessions: await db.sessions.orderBy('finishedAt').toArray(),
    plan: await loadPlan(),
    settings,
  };
}

const KINDS: LoadKind[] = ['weight', 'assist', 'bodyweight'];
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function readSession(v: unknown): Session | null {
  if (!isObj(v) || typeof v.id !== 'string' || !v.id || !isNum(v.startedAt) || !isNum(v.finishedAt) || !Array.isArray(v.entries)) return null;
  const entries: SessionEntry[] = [];
  for (const e of v.entries) {
    if (!isObj(e) || typeof e.name !== 'string' || !Array.isArray(e.sets)) return null;
    const sets = [];
    for (const s of e.sets) {
      if (!isObj(s) || !isNum(s.weight) || !isNum(s.reps)) return null;
      sets.push({ weight: s.weight, reps: s.reps });
    }
    entries.push({
      exerciseId: typeof e.exerciseId === 'string' ? e.exerciseId : slug(e.name),
      name: e.name,
      kind: KINDS.includes(e.kind as LoadKind) ? (e.kind as LoadKind) : 'weight',
      sets,
      rir: isNum(e.rir) ? e.rir : null,
    });
  }
  const session: Session = {
    id: v.id,
    dayId: String(v.dayId ?? ''),
    dayLabel: String(v.dayLabel ?? ''),
    dayName: String(v.dayName ?? ''),
    startedAt: v.startedAt,
    finishedAt: v.finishedAt,
    entries,
    synced: v.synced === 1 ? 1 : 0,
  };
  if (isNum(v.syncedAt)) session.syncedAt = v.syncedAt;
  return session;
}

/** Reads a backup file. Throws an Error with a message meant for the user when the file is not usable. */
export function parseBackup(text: string): Backup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('This file is not a Gym Log backup.');
  }
  if (!isObj(raw) || raw.app !== 'gym-log' || !Array.isArray(raw.sessions)) throw new Error('This file is not a Gym Log backup.');
  if (!isNum(raw.version) || raw.version > BACKUP_VERSION) throw new Error('This backup was made by a newer version of the app. Update the app first.');
  const sessions: Session[] = [];
  for (const s of raw.sessions) {
    const session = readSession(s);
    if (!session) throw new Error('The backup file is damaged: a workout in it cannot be read.');
    sessions.push(session);
  }
  const plan = raw.plan;
  if (!isObj(plan) || !Array.isArray(plan.days)) throw new Error('The backup file is damaged: the training plan is missing.');
  return {
    app: 'gym-log',
    version: raw.version,
    exportedAt: isNum(raw.exportedAt) ? raw.exportedAt : 0,
    sessions,
    plan: plan as unknown as Plan,
    settings: (isObj(raw.settings) ? raw.settings : {}) as Backup['settings'],
  };
}

/** Workouts in `sessions` that this phone does not have yet. */
export async function newSessions(sessions: Session[]): Promise<Session[]> {
  const have = new Set(await db.sessions.toCollection().primaryKeys());
  const seen = new Set<string>();
  return sessions.filter((s) => !have.has(s.id) && !seen.has(s.id) && seen.add(s.id));
}

/** Adds workouts this phone does not have. Workouts already here are never changed. Returns how many were added. */
export async function importSessions(sessions: Session[]): Promise<number> {
  const fresh = await newSessions(sessions);
  await db.sessions.bulkPut(fresh);
  return fresh.length;
}

/** Adds the workouts of a backup. With `withPlan`, the plan and settings of the backup replace the current ones. */
export async function restoreBackup(backup: Backup, withPlan: boolean): Promise<number> {
  const added = await importSessions(backup.sessions);
  if (withPlan) {
    await savePlan(backup.plan);
    const current = await loadSettings();
    await saveSettings({ ...current, ...backup.settings, syncUrl: current.syncUrl || backup.settings.syncUrl || '', syncToken: current.syncToken });
  }
  return added;
}

export function markBackedUp(at = Date.now()): Promise<string> {
  return db.kv.put({ key: LAST_BACKUP, value: at });
}

export async function lastBackupAt(): Promise<number> {
  return ((await db.kv.get(LAST_BACKUP))?.value as number | undefined) ?? 0;
}

/** Workouts that exist only on this phone: not in the Google Sheet and newer than the last backup file. */
export function onlyOnThisPhone(sessions: Session[], backedUpAt: number): Session[] {
  return sessions.filter((s) => s.synced === 0 && s.finishedAt > backedUpAt);
}

const REMIND_COUNT = 3;
const REMIND_AGE_MS = 7 * 86_400_000;

/** True when a backup reminder is due: several unprotected workouts, or one that has waited a week. */
export function backupDue(sessions: Session[], backedUpAt: number, now: number): boolean {
  const open = onlyOnThisPhone(sessions, backedUpAt);
  return open.length >= REMIND_COUNT || open.some((s) => now - s.finishedAt > REMIND_AGE_MS);
}

// ---------- restore from the Google Sheet ----------

type Cell = string | number | null | undefined;

function parseClock(v: Cell): { h: number; m: number } | null {
  const match = /(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]m)?/i.exec(String(v ?? ''));
  if (!match) return null;
  let h = Number(match[1]);
  const half = match[3]?.toLowerCase();
  if (half === 'pm' && h < 12) h += 12;
  if (half === 'am' && h === 12) h = 0;
  return h < 24 ? { h, m: Number(match[2]) } : null;
}

/**
 * Rebuilds workouts from the rows of the "Sets" and "Sessions" tabs. Times are exact to the minute.
 * A workout without a "Sessions" row (synced by an early version of the app) is placed at noon.
 */
export function sessionsFromSheet(setRows: Cell[][], sessionRows: Cell[][], plan: Plan): Session[] {
  const times = new Map<string, { clock: ReturnType<typeof parseClock>; minutes: number }>();
  for (const r of sessionRows) times.set(String(r[1] ?? ''), { clock: parseClock(r[3]), minutes: Number(r[4]) || 0 });

  interface Draft {
    date: string;
    day: string;
    entries: Map<string, { name: string; kind: LoadKind; rir: number | null; sets: { n: number; weight: number; reps: number }[] }>;
  }
  const drafts = new Map<string, Draft>();
  for (const r of setRows) {
    const id = String(r[1] ?? '');
    const name = String(r[3] ?? '');
    const date = String(r[0] ?? '').slice(0, 10);
    if (!id || !name || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    let draft = drafts.get(id);
    if (!draft) drafts.set(id, (draft = { date, day: String(r[2] ?? ''), entries: new Map() }));
    let entry = draft.entries.get(name);
    if (!entry) {
      const kind = KINDS.includes(r[4] as LoadKind) ? (r[4] as LoadKind) : 'weight';
      const rir = r[8] === '' || r[8] === null || r[8] === undefined || !Number.isFinite(Number(r[8])) ? null : Number(r[8]);
      draft.entries.set(name, (entry = { name, kind, rir, sets: [] }));
    }
    entry.sets.push({ n: Number(r[5]) || entry.sets.length + 1, weight: Number(r[6]) || 0, reps: Number(r[7]) || 0 });
  }

  const out: Session[] = [];
  for (const [id, d] of drafts) {
    const [y, mo, da] = d.date.split('-').map(Number);
    const t = times.get(id);
    let startedAt = new Date(y, mo - 1, da, t?.clock?.h ?? 12, t?.clock?.m ?? 0).getTime();
    let finishedAt = startedAt + (t?.minutes ?? 0) * 60_000;
    // The sheet holds the date the workout ended. One that ran past midnight started the day before.
    if (localDate(finishedAt) !== d.date) {
      startedAt = new Date(y, mo - 1, da - 1, t?.clock?.h ?? 12, t?.clock?.m ?? 0).getTime();
      finishedAt = startedAt + (t?.minutes ?? 0) * 60_000;
    }

    const [label, ...rest] = d.day.split(' · ');
    const dayName = rest.join(' · ') || label;
    const planDay = plan.days.find((p) => p.label === label && p.name === dayName) ?? plan.days.find((p) => p.name === dayName);
    out.push({
      id,
      dayId: planDay?.id ?? `restored-${slug(dayName)}`,
      dayLabel: rest.length ? label : '',
      dayName,
      startedAt,
      finishedAt,
      synced: 1,
      entries: [...d.entries.values()].map((e) => ({
        exerciseId: planDay?.exercises.find((x) => exerciseKey(x.name) === exerciseKey(e.name))?.id ?? slug(e.name),
        name: e.name,
        kind: e.kind,
        rir: e.rir,
        sets: e.sets.sort((a, b) => a.n - b.n).map(({ weight, reps }) => ({ weight, reps })),
      })),
    });
  }
  return out.sort((a, b) => a.finishedAt - b.finishedAt);
}

/** Reads every workout stored in the Google Sheet. */
export async function fetchSheetSessions(settings: Pick<Settings, 'syncUrl' | 'syncToken'>, plan: Plan): Promise<Session[]> {
  const r = await postToScript(settings, { restore: true });
  if (!r.ok) {
    // A script from before this feature treats the request as a sync without a session.
    if (r.error === 'Missing sessionId') throw new Error('The Apps Script in your sheet is an older version. Update it (README, "Google Sheets sync") and try again.');
    throw new Error(r.error ?? 'Rejected by the script');
  }
  return sessionsFromSheet((r.sets ?? []) as Cell[][], (r.sessions ?? []) as Cell[][], plan);
}
