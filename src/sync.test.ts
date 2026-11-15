import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, saveSettings } from './db';
import { syncPending } from './sync';
import { DEFAULT_SETTINGS, type Session } from './types';

function session(id: string, finishedAt: number): Session {
  return {
    id,
    dayId: 'mon-upper-a',
    dayLabel: 'Mon',
    dayName: 'Upper A',
    startedAt: finishedAt - 1000,
    finishedAt,
    synced: 0,
    entries: [{ exerciseId: 'x', name: 'Lat pulldown', kind: 'weight', rir: 2, sets: [{ weight: 42, reps: 12 }] }],
  };
}

function okResponse(body: object) {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe('syncPending', () => {
  beforeEach(async () => {
    await db.sessions.clear();
    await db.kv.clear();
    await saveSettings({ ...DEFAULT_SETTINGS, syncUrl: 'https://script.example/exec', syncToken: 'secret' });
    await db.sessions.bulkPut([session('a', 1), session('b', 2)]);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('does nothing when sync is not configured', async () => {
    await saveSettings(DEFAULT_SETTINGS);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await syncPending()).status).toBe('not-configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('marks sessions synced only after the script answers ok', async () => {
    const fetchMock = vi.fn(async () => okResponse({ ok: true, appended: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await syncPending();
    expect(r).toMatchObject({ status: 'done', synced: 2, failed: 0 });
    expect((await db.sessions.toArray()).every((s) => s.synced === 1)).toBe(true);

    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.token).toBe('secret');
    expect(body.sessionId).toBe('a');
    expect(body.rows[0][1]).toBe('Lat pulldown');
    expect(body.sets).toHaveLength(1);
    expect(body.sets[0].slice(3, 8)).toEqual(['Lat pulldown', 'weight', 1, 42, 12]);
    expect(body.sets[0][9]).toBe('Lats');
    expect(body.session[6]).toBe(1);
  });

  it('keeps sessions queued when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Load failed'))));
    const r = await syncPending();
    expect(r).toMatchObject({ status: 'done', synced: 0, failed: 2 });
    const all = await db.sessions.toArray();
    expect(all).toHaveLength(2);
    expect(all.every((s) => s.synced === 0 && s.lastSyncError === 'Load failed')).toBe(true);
  });

  it('keeps sessions queued when the token is rejected', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse({ ok: false, error: 'Bad token' })));
    await syncPending();
    expect((await db.sessions.where('synced').equals(0).count())).toBe(2);
  });

  it('keeps going after one failure and syncs the rest', async () => {
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async () => (n++ === 0 ? new Response('oops', { status: 500 }) : okResponse({ ok: true }))));
    const r = await syncPending();
    expect(r).toMatchObject({ synced: 1, failed: 1 });
    expect((await db.sessions.get('a'))?.synced).toBe(0);
    expect((await db.sessions.get('b'))?.synced).toBe(1);
  });

  it('treats a duplicate (already in the sheet) as synced', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse({ ok: true, duplicate: true })));
    await syncPending();
    expect(await db.sessions.where('synced').equals(1).count()).toBe(2);
  });
});
