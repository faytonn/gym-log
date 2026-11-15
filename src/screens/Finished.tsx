import type { Session, Settings } from '../types';
import { fmtDuration } from '../workout';

interface Props {
  session: Session | undefined;
  settings: Settings;
  syncing: boolean;
  syncLabel: string | null;
  onSync: () => void;
  onDone: () => void;
  onSettings: () => void;
}

export function Finished({ session, settings, syncing, syncLabel, onSync, onDone, onSettings }: Props) {
  if (!session) return null;
  const sets = session.entries.reduce((n, e) => n + e.sets.length, 0);
  const configured = Boolean(settings.syncUrl && settings.syncToken);

  return (
    <div className="screen finished">
      <div className="finished-body">
        <span className="lab">Session complete</span>
        <h1>Workout saved</h1>
        <p className="muted">
          {session.dayLabel} · {session.dayName} · {session.entries.length} exercises · {sets} sets ·{' '}
          {fmtDuration(session.finishedAt - session.startedAt)}
        </p>
        <p className="muted small">Saved on this phone. It is safe even if syncing fails.</p>

        <div className="card sync-card">
          {!configured ? (
            <>
              <p>Google Sheets sync is not set up yet.</p>
              <button type="button" className="btn btn-secondary btn-block" onClick={onSettings}>
                Set up sync
              </button>
            </>
          ) : session.synced ? (
            <p className="ok">Synced to Google Sheets ✓</p>
          ) : (
            <>
              <p>{syncing ? 'Syncing to Google Sheets…' : (syncLabel ?? 'Sync this workout to your Google Sheet?')}</p>
              <button type="button" className="btn btn-accent btn-block" disabled={syncing} onClick={onSync}>
                {syncing ? 'Syncing…' : 'Sync to Google Sheets'}
              </button>
              <p className="muted small">
                {settings.autoSync
                  ? 'If you are offline it stays queued and retries automatically.'
                  : 'If it fails it stays queued. Sync it later from History or Settings.'}
              </p>
            </>
          )}
        </div>
      </div>
      <button type="button" className="btn btn-block btn-secondary" onClick={onDone}>
        Done
      </button>
    </div>
  );
}
