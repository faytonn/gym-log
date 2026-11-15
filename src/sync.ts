import { db, loadPlan, loadSettings, pendingSessions } from './db';
import { DEMO } from './mode';
import { sessionSummaryRow, sessionToRows, sessionToSetRows } from './export';
import { targetsLookup, type MuscleTargets } from './muscles';
import type { Session, Settings } from './types';

export type SyncOutcome =
  | { status: 'not-configured' }
  | { status: 'offline'; pending: number }
  | { status: 'done'; synced: number; failed: number; error?: string };

const TIMEOUT_MS = 25_000;

interface ScriptResponse {
  ok: boolean;
  error?: string;
  appended?: number;
  duplicate?: boolean;
}

/**
 * POST to the Apps Script web app. The body is sent as text/plain so the browser does not send
 * a CORS preflight (Apps Script cannot answer OPTIONS requests).
 */
export async function postToScript(settings: Pick<Settings, 'syncUrl' | 'syncToken'>, payload: object): Promise<ScriptResponse> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(settings.syncUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: settings.syncToken, ...payload }),
      redirect: 'follow',
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    try {
      return JSON.parse(text) as ScriptResponse;
    } catch {
      throw new Error('Unexpected response (is the web app deployed with access "Anyone"?)');
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function testConnection(settings: Pick<Settings, 'syncUrl' | 'syncToken'>): Promise<string> {
  if (DEMO) throw new Error('Sync is turned off in the demo');
  const r = await postToScript(settings, { ping: true });
  if (!r.ok) throw new Error(r.error ?? 'Rejected');
  return 'Connected';
}

async function syncOne(settings: Settings, session: Session, targets: (name: string) => MuscleTargets): Promise<void> {
  const r = await postToScript(settings, {
    sessionId: session.id,
    rows: sessionToRows(session), // "Log" tab, one row per exercise
    sets: sessionToSetRows(session, targets), // "Sets" tab, one row per set
    session: sessionSummaryRow(session), // "Sessions" tab
  });
  if (!r.ok) throw new Error(r.error ?? 'Rejected by the script');
  // Only now is the session marked as synced. Any failure above leaves it queued.
  await db.sessions.update(session.id, { synced: 1, syncedAt: Date.now(), lastSyncError: undefined });
}

let running: Promise<SyncOutcome> | null = null;

/** Sends every queued session. Safe to call often: concurrent calls share one run. */
export function syncPending(): Promise<SyncOutcome> {
  if (!running) running = run().finally(() => (running = null));
  return running;
}

async function run(): Promise<SyncOutcome> {
  if (DEMO) return { status: 'not-configured' };
  const settings = await loadSettings();
  if (!settings.syncUrl || !settings.syncToken) return { status: 'not-configured' };
  const pending = await pendingSessions();
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { status: 'offline', pending: pending.length };

  const targets = targetsLookup(await loadPlan());
  let synced = 0;
  let failed = 0;
  let error: string | undefined;
  for (const s of pending) {
    try {
      await syncOne(settings, s, targets);
      synced++;
    } catch (e) {
      failed++;
      error = e instanceof Error ? (e.name === 'AbortError' ? 'Timed out' : e.message) : String(e);
      await db.sessions.update(s.id, { lastSyncError: error });
    }
  }
  return { status: 'done', synced, failed, error };
}
