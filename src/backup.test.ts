import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { backupDue, importSessions, makeBackup, onlyOnThisPhone, parseBackup, restoreBackup, sessionsFromSheet } from './backup';
import { db, loadPlan, loadSettings, savePlan, saveSettings } from './db';
import { sessionSummaryRow, sessionToSetRows } from './export';
import { defaultMuscles } from './muscles';
import { seedPlan } from './seed';
import { DEFAULT_SETTINGS, type Session } from './types';

const DAY = 86_400_000;

function session(id: string, finishedAt: number, synced: 0 | 1 = 0): Session {
  return {
    id,
    dayId: 'mon-upper-a',
    dayLabel: 'Mon',
    dayName: 'Upper A',
    startedAt: finishedAt - 50 * 60_000,
    finishedAt,
    synced,
    entries: [
      { exerciseId: 'x', name: 'Lat pulldown', kind: 'weight', rir: 2, sets: [{ weight: 42.5, reps: 12 }, { weight: 42.5, reps: 10 }] },
      { exerciseId: 'y', name: 'Assisted dip', kind: 'assist', rir: null, sets: [{ weight: 20, reps: 8 }] },
    ],
  };
}

beforeEach(async () => {
  await db.sessions.clear();
  await db.kv.clear();
});

describe('backup file', () => {
  it('restores every workout, the plan and the settings on an empty phone', async () => {
    const plan = seedPlan();
    plan.days[0].name = 'My own day';
    await savePlan(plan);
    await saveSettings({ ...DEFAULT_SETTINGS, compoundRest: 200, syncUrl: 'https://script.example/exec', syncToken: 'secret' });
    await db.sessions.bulkPut([session('a', 1000), session('b', 2000, 1)]);
    const text = JSON.stringify(await makeBackup());

    await db.sessions.clear();
    await db.kv.clear();
    expect(await restoreBackup(parseBackup(text), true)).toBe(2);

    expect(await db.sessions.orderBy('finishedAt').toArray()).toEqual([session('a', 1000), session('b', 2000, 1)]);
    expect((await loadPlan()).days[0].name).toBe('My own day');
    const settings = await loadSettings();
    expect(settings.compoundRest).toBe(200);
    expect(settings.syncUrl).toBe('https://script.example/exec');
  });

  it('never contains the sync token', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, syncUrl: 'https://script.example/exec', syncToken: 'secret' });
    expect(JSON.stringify(await makeBackup())).not.toContain('secret');
  });

  it('adds only missing workouts and leaves existing ones and the plan alone', async () => {
    await db.sessions.bulkPut([session('a', 1000), session('b', 2000)]);
    const text = JSON.stringify(await makeBackup());
    await db.sessions.delete('b');
    await db.sessions.update('a', { synced: 1 });
    const plan = await loadPlan();
    plan.days[0].name = 'Edited after the backup';
    await savePlan(plan);

    expect(await restoreBackup(parseBackup(text), false)).toBe(1);
    expect((await db.sessions.get('a'))!.synced).toBe(1);
    expect(await db.sessions.count()).toBe(2);
    expect((await loadPlan()).days[0].name).toBe('Edited after the backup');
  });

  it('keeps the sync connection of this phone when the plan is restored', async () => {
    const text = JSON.stringify(await makeBackup());
    await saveSettings({ ...DEFAULT_SETTINGS, syncUrl: 'https://mine.example/exec', syncToken: 'mine' });
    await restoreBackup(parseBackup(text), true);
    expect(await loadSettings()).toMatchObject({ syncUrl: 'https://mine.example/exec', syncToken: 'mine' });
  });

  it('rejects files that are not a backup, with a readable message', () => {
    expect(() => parseBackup('Date,Exercise\r\n')).toThrow('not a Gym Log backup');
    expect(() => parseBackup('{"sessions":[]}')).toThrow('not a Gym Log backup');
    expect(() => parseBackup(JSON.stringify({ app: 'gym-log', version: 99, sessions: [], plan: { days: [] } }))).toThrow('newer version');
    expect(() => parseBackup(JSON.stringify({ app: 'gym-log', version: 1, sessions: [{ id: 'a' }], plan: { days: [] } }))).toThrow('damaged');
  });

  it('does not import the same workout twice from one file', async () => {
    expect(await importSessions([session('a', 1000), session('a', 1000)])).toBe(1);
  });
});

describe('backup reminder', () => {
  const now = 100 * DAY;
  it('counts workouts that are neither synced nor in the last backup file', () => {
    const all = [session('a', now - 3 * DAY, 1), session('b', now - 2 * DAY), session('c', now - DAY)];
    expect(onlyOnThisPhone(all, 0).map((s) => s.id)).toEqual(['b', 'c']);
    expect(onlyOnThisPhone(all, now - 1.5 * DAY).map((s) => s.id)).toEqual(['c']);
  });

  it('is due after three unprotected workouts, or when one has waited a week', () => {
    expect(backupDue([session('a', now - DAY), session('b', now)], 0, now)).toBe(false);
    expect(backupDue([session('a', now - 2 * DAY), session('b', now - DAY), session('c', now)], 0, now)).toBe(true);
    expect(backupDue([session('a', now - 8 * DAY)], 0, now)).toBe(true);
    expect(backupDue([session('a', now - 8 * DAY)], now - DAY, now)).toBe(false);
    expect(backupDue([session('a', now - 8 * DAY, 1)], 0, now)).toBe(false);
  });
});

describe('sessionsFromSheet', () => {
  const targets = (name: string) => defaultMuscles(name);
  const sheet = (list: Session[]) => ({ sets: list.flatMap((s) => sessionToSetRows(s, targets)), sessions: list.map(sessionSummaryRow) });

  it('rebuilds workouts from the Sets and Sessions rows, exact to the minute', () => {
    const plan = seedPlan();
    const day = plan.days[0];
    const original: Session = {
      ...session('s1', new Date(2026, 10, 14, 18, 50).getTime()),
      dayId: day.id,
      dayLabel: day.label,
      dayName: day.name,
    };
    original.entries[0] = { ...original.entries[0], name: day.exercises[0].name, exerciseId: day.exercises[0].id };
    const { sets, sessions } = sheet([original]);

    const [restored] = sessionsFromSheet(sets, sessions, plan);
    expect(restored).toEqual({ ...original, synced: 1, entries: [original.entries[0], { ...original.entries[1], exerciseId: 'assisted-dip' }] });
  });

  it('puts a workout that ran past midnight on the right days', () => {
    const late = session('late', new Date(2026, 10, 15, 0, 20).getTime());
    const { sets, sessions } = sheet([late]);
    const [restored] = sessionsFromSheet(sets, sessions, seedPlan());
    expect(restored.startedAt).toBe(late.startedAt);
    expect(restored.finishedAt).toBe(late.finishedAt);
  });

  it('reads a start time that Sheets shows as 6:30 PM', () => {
    const s = session('pm', new Date(2026, 10, 14, 19, 20).getTime());
    const { sets, sessions } = sheet([s]);
    sessions[0][3] = '6:30:00 PM';
    expect(sessionsFromSheet(sets, sessions, seedPlan())[0].startedAt).toBe(new Date(2026, 10, 14, 18, 30).getTime());
  });

  it('places a workout without a Sessions row at noon, and skips rows it cannot read', () => {
    const s = session('old', new Date(2026, 10, 14, 18, 50).getTime());
    const { sets } = sheet([s]);
    const [restored, ...more] = sessionsFromSheet([...sets, ['', '', '', '', '', '', '', '', '', '', ''], ['not a date', 'x', 'Day', 'Curl', 'weight', 1, 5, 5, '', '', '']], [], { days: [] });
    expect(more).toHaveLength(0);
    expect(restored.finishedAt).toBe(new Date(2026, 10, 14, 12, 0).getTime());
    expect(restored.entries.map((e) => e.sets.length)).toEqual([2, 1]);
    expect(restored.dayId).toBe('restored-upper-a');
  });
});
