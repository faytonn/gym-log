import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useRef, useState } from 'react';
import { clearActive, commitSession, db, loadActive, loadPlan, requestPersistentStorage, saveActive } from './db';
import { Finished } from './screens/Finished';
import { History } from './screens/History';
import { Home } from './screens/Home';
import { Muscles } from './screens/Muscles';
import { SettingsScreen } from './screens/Settings';
import { Workout } from './screens/Workout';
import { syncPending, type SyncOutcome } from './sync';
import { DEFAULT_SETTINGS, type ActiveSession, type Plan, type Settings } from './types';
import { countSets, newActive, toSession } from './workout';

type Route = { name: 'home' } | { name: 'workout' } | { name: 'history' } | { name: 'muscles' } | { name: 'settings' } | { name: 'finished'; sessionId: string };

const RETRY_MS = 60_000;

function describe(o: SyncOutcome): string | null {
  if (o.status === 'not-configured') return 'Sync not set up';
  if (o.status === 'offline') return 'Offline, will retry';
  if (o.failed > 0) return `Sync failed: ${o.error ?? 'unknown error'}. Will retry.`;
  if (o.synced > 0) return `Synced ${o.synced} workout${o.synced > 1 ? 's' : ''}`;
  return null;
}

export function App() {
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState<ActiveSession | null>(null);
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [syncing, setSyncing] = useState(false);
  const [syncLabel, setSyncLabel] = useState<string | null>(null);

  const plan = useLiveQuery(async () => (await db.kv.get('plan'))?.value as Plan | undefined);
  const settings = useLiveQuery(async () => ({ ...DEFAULT_SETTINGS, ...((await db.kv.get('settings'))?.value as Partial<Settings>) }));
  const sessions = useLiveQuery(() => db.sessions.toArray());
  const pending = sessions?.filter((s) => s.synced === 0).length ?? 0;

  // Boot: seed the plan on first run and reopen a workout that was in progress.
  useEffect(() => {
    void (async () => {
      await loadPlan();
      const a = await loadActive();
      setActive(a);
      if (a) setRoute({ name: 'workout' });
      setReady(true);
      void requestPersistentStorage();
    })();
  }, []);

  // Every change to the live workout is written to IndexedDB right away,
  // so closing the app or locking the phone never loses a set.
  const updateActive = useCallback((fn: (a: ActiveSession) => ActiveSession) => {
    setActive((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      void saveActive(next);
      return next;
    });
  }, []);

  const runSync = useCallback(async () => {
    setSyncing(true);
    try {
      setSyncLabel(describe(await syncPending()));
    } catch (e) {
      setSyncLabel(`Sync failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSyncing(false);
    }
  }, []);

  // Background retry of queued sessions.
  const pendingRef = useRef(0);
  pendingRef.current = pending;
  useEffect(() => {
    if (!settings?.autoSync || !settings.syncUrl || !settings.syncToken) return;
    const tryNow = () => {
      if (pendingRef.current > 0 && navigator.onLine) void runSync();
    };
    const onVis = () => document.visibilityState === 'visible' && tryNow();
    tryNow();
    window.addEventListener('online', tryNow);
    document.addEventListener('visibilitychange', onVis);
    const id = setInterval(tryNow, RETRY_MS);
    return () => {
      window.removeEventListener('online', tryNow);
      document.removeEventListener('visibilitychange', onVis);
      clearInterval(id);
    };
  }, [settings?.autoSync, settings?.syncUrl, settings?.syncToken, runSync]);

  if (!ready || !plan || !settings || !sessions) return <div className="screen" />;

  const startDay = (dayId: string) => {
    if (active && active.dayId === dayId) return setRoute({ name: 'workout' });
    if (active) {
      const d = plan.days.find((x) => x.id === active.dayId);
      const n = countSets(active);
      if (n > 0 && !confirm(`You have a ${d?.name ?? ''} workout in progress (${n} sets). Discard it and start a new one?`)) return;
    }
    const day = plan.days.find((d) => d.id === dayId)!;
    const a = newActive(day, sessions);
    setActive(a);
    void saveActive(a);
    setRoute({ name: 'workout' });
  };

  const discard = async () => {
    await clearActive();
    setActive(null);
    setRoute({ name: 'home' });
  };

  const finish = async () => {
    if (!active) return;
    const day = plan.days.find((d) => d.id === active.dayId);
    if (!day) return;
    if (countSets(active) === 0) {
      if (confirm('No sets logged. Discard this workout?')) await discard();
      return;
    }
    if (!confirm('Finish and save this workout?')) return;
    const session = toSession(active, day);
    await commitSession(session);
    setActive(null);
    setSyncLabel(null);
    setRoute({ name: 'finished', sessionId: session.id });
    if (settings.autoSync && settings.syncUrl && settings.syncToken) void runSync();
  };

  const home = () => setRoute({ name: 'home' });
  const activeDay = active && plan.days.find((d) => d.id === active.dayId);

  switch (route.name) {
    case 'workout':
      if (active && activeDay)
        return (
          <Workout
            day={activeDay}
            active={active}
            sessions={sessions}
            settings={settings}
            update={updateActive}
            onFinish={finish}
            onDiscard={discard}
            onBack={home}
          />
        );
      // The day was deleted from the plan mid-workout.
      return (
        <div className="screen finished">
          <p>This workout's day no longer exists in the plan.</p>
          <button type="button" className="btn btn-block btn-secondary" onClick={discard}>
            Discard it
          </button>
        </div>
      );
    case 'finished':
      return (
        <Finished
          session={sessions.find((s) => s.id === route.sessionId)}
          settings={settings}
          syncing={syncing}
          syncLabel={syncLabel}
          onSync={runSync}
          onDone={home}
          onSettings={() => setRoute({ name: 'settings' })}
        />
      );
    case 'history':
      return <History sessions={sessions} syncing={syncing} syncLabel={syncLabel} onSync={runSync} onBack={home} />;
    case 'muscles':
      return <Muscles plan={plan} sessions={sessions} onBack={home} />;
    case 'settings':
      return <SettingsScreen plan={plan} settings={settings} pending={pending} syncing={syncing} syncLabel={syncLabel} onSync={runSync} onBack={home} />;
    default:
      return (
        <Home
          plan={plan}
          sessions={sessions}
          active={active}
          pending={pending}
          syncLabel={syncing ? 'syncing…' : null}
          onStart={startDay}
          onResume={() => setRoute({ name: 'workout' })}
          onHistory={() => setRoute({ name: 'history' })}
          onMuscles={() => setRoute({ name: 'muscles' })}
          onSettings={() => setRoute({ name: 'settings' })}
          onSync={runSync}
        />
      );
  }
}
