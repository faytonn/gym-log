import { useEffect, useState } from 'react';
import { db } from '../db';
import { sessionToRows } from '../export';
import type { Session } from '../types';

const STEP_MS = 700;

/**
 * Demo only: plays the steps a real sync goes through, without sending anything, and explains
 * the real process. Marks the session as synced at the end so the demo shows nothing as queued.
 */
export function DemoSync({ session }: { session: Session }) {
  const rows = sessionToRows(session).length;
  const sets = session.entries.reduce((n, e) => n + e.sets.length, 0);
  const steps = [
    'Saved on this phone',
    'Sent to the Apps Script web app with the secret token',
    `Wrote ${rows} row${rows === 1 ? '' : 's'} to Log, ${sets} to Sets and 1 to Sessions`,
    'Rebuilt the Dashboard, Progress, Weekly and PRs tabs',
  ];

  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [done, setDone] = useState(reduced ? steps.length : 1);

  useEffect(() => {
    if (done >= steps.length) {
      void db.sessions.update(session.id, { synced: 1, syncedAt: Date.now() });
      return;
    }
    const id = setTimeout(() => setDone((n) => n + 1), STEP_MS);
    return () => clearTimeout(id);
  }, [done, steps.length, session.id]);

  const finished = done >= steps.length;

  return (
    <div className="demo-sync">
      <span className="lab">{finished ? 'Synced to Google Sheets (simulated)' : 'Syncing to Google Sheets (simulated)…'}</span>
      <ol className="demo-steps">
        {steps.map((text, i) => (
          <li key={text} className={i < done ? 'done' : i === done ? 'now' : ''}>
            <span className="demo-step-mark" aria-hidden="true">
              {i < done ? 'OK' : i === done ? '··' : ''}
            </span>
            <span>{text}</span>
          </li>
        ))}
      </ol>
      <div className="demo-note" role="note">
        <strong>This is a demo, so nothing was sent.</strong>
        <p>
          In a real copy of the app, a finished workout is saved on the phone first. The app then posts it to a Google Apps Script web app that is
          attached to the user's own Google Sheet, together with a secret token that only that phone knows.
        </p>
        <p>
          The script appends the workout to the sheet and rebuilds the summary tabs. If the phone is offline or the request fails, the workout waits
          in a queue and the app retries when it is back online. The script remembers which workouts it has already written, so a retry never adds
          duplicate rows.
        </p>
      </div>
    </div>
  );
}
