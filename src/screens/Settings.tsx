import { useEffect, useState } from 'react';
import { fetchSheetSessions, importSessions, makeBackup, markBackedUp, newSessions, onlyOnThisPhone, parseBackup, restoreBackup } from '../backup';
import { ask, choose, tell } from '../components/Dialog';
import { Stepper } from '../components/Stepper';
import { TextField } from '../components/TextField';
import { DEMO } from '../mode';
import { loadSettings, requestPersistentStorage, savePlan, saveSettings } from '../db';
import { localDate } from '../export';
import { pickTextFile, saveFile } from '../files';
import { MUSCLES, MUSCLE_LABEL, defaultMuscles, type Muscle } from '../muscles';
import { seedPlan, slug } from '../seed';
import { testConnection } from '../sync';
import type { LoadKind, Plan, PlanDay, PlanExercise, RestType, Session, Settings } from '../types';
import { fmtDate, fmtDuration } from '../workout';

interface Props {
  plan: Plan;
  settings: Settings;
  sessions: Session[];
  /** When the last backup file was saved, 0 for never. */
  backedUpAt: number;
  pending: number;
  syncing: boolean;
  syncLabel: string | null;
  onSync: () => void;
}

function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function SettingsScreen({ plan, settings, sessions, backedUpAt, pending, syncing, syncLabel, onSync }: Props) {
  const set = (patch: Partial<Settings>) => void saveSettings({ ...settings, ...patch });
  const [test, setTest] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);

  const runTest = async () => {
    setTest('Testing…');
    try {
      // Read the stored settings: a field that was just edited saves on blur, after this render.
      setTest(`✓ ${await testConnection(await loadSettings())}`);
    } catch (e) {
      setTest(`✗ ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="screen">
      <header className="topbar topbar-plain">
        <div className="topbar-title">
          <span>Settings</span>
        </div>
      </header>

      <div className="cards">
        <BackupCard plan={plan} settings={settings} sessions={sessions} backedUpAt={backedUpAt} />

        <section className="card form">
          <h2>Google Sheets sync</h2>
          {DEMO ? (
            <p className="small muted">Sync is turned off in the demo. In your own copy of the app, this is where you connect a Google Sheet.</p>
          ) : (
            <>
          <label className="field">
            <span className="muted">Apps Script web app URL</span>
            <TextField
              type="url"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              placeholder="https://script.google.com/macros/s/…/exec"
              value={settings.syncUrl}
              onCommit={(v) => set({ syncUrl: v.trim() })}
            />
          </label>
          <label className="field">
            <span className="muted">Secret token</span>
            <div className="input-row">
              {/* Not type="password": a password manager would fill in a saved login here, over the stored token. */}
              <TextField
                type="text"
                name="gym-log-sync-token"
                className={showToken ? undefined : 'masked'}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                data-1p-ignore
                data-lpignore="true"
                value={settings.syncToken}
                onCommit={(v) => set({ syncToken: v.trim() })}
              />
              <button type="button" className="btn btn-small btn-secondary" onClick={() => setShowToken(!showToken)}>
                {showToken ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>
          <Toggle label="Sync automatically when online" checked={settings.autoSync} onChange={(autoSync) => set({ autoSync })} />
          <div className="btn-row">
            <button type="button" className="btn btn-secondary" disabled={!settings.syncUrl || !settings.syncToken} onClick={runTest}>
              Test connection
            </button>
            <button type="button" className="btn btn-accent" disabled={syncing || pending === 0} onClick={onSync}>
              {syncing ? 'Syncing…' : `Sync now (${pending})`}
            </button>
          </div>
          {test && <p className="small">{test}</p>}
          {syncLabel && <p className="small muted">{syncLabel}</p>}
            </>
          )}
        </section>

        <section className="card form">
          <h2>Rest timer</h2>
          <Stepper label={`Compound · ${fmtDuration(settings.compoundRest * 1000)}`} unit="seconds" value={settings.compoundRest} step={15} min={15} onChange={(compoundRest) => set({ compoundRest })} />
          <Stepper label={`Isolation · ${fmtDuration(settings.isolationRest * 1000)}`} unit="seconds" value={settings.isolationRest} step={15} min={15} onChange={(isolationRest) => set({ isolationRest })} />
          <Toggle label="Beep when rest is over" checked={settings.sound} onChange={(sound) => set({ sound })} />
          <Toggle label="Keep screen on during workout" checked={settings.keepAwake} onChange={(keepAwake) => set({ keepAwake })} />
          <p className="small muted">iPhone stops timers while the screen is locked, so keep the screen on if you want the beep.</p>
        </section>

        <PlanEditor plan={plan} />
      </div>
    </div>
  );
}

function BackupCard({ plan, settings, sessions, backedUpAt }: { plan: Plan; settings: Settings; sessions: Session[]; backedUpAt: number }) {
  const [busy, setBusy] = useState(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const configured = !DEMO && Boolean(settings.syncUrl && settings.syncToken);
  const open = onlyOnThisPhone(sessions, backedUpAt).length;
  const queued = configured ? sessions.filter((s) => s.synced === 0).length : 0;

  useEffect(() => {
    void requestPersistentStorage().then(setPersisted);
  }, []);

  const save = async () => {
    const backup = await makeBackup();
    if (await saveFile(`gym-log-backup-${localDate(backup.exportedAt)}.json`, JSON.stringify(backup), 'application/json')) await markBackedUp(backup.exportedAt);
  };

  const report = (n: number, found: number) =>
    tell(n > 0 ? `${n} workout${n === 1 ? '' : 's'} restored` : 'Nothing to restore', n > 0 ? undefined : `All ${found} workout${found === 1 ? '' : 's'} found are already on this phone.`);

  const fromFile = async () => {
    try {
      const text = await pickTextFile('application/json,.json');
      if (text === null) return;
      const backup = parseBackup(text);
      const fresh = (await newSessions(backup.sessions)).length;
      const what = await choose({
        title: `Backup from ${fmtDate(backup.exportedAt)}`,
        body: `${backup.sessions.length} workout${backup.sessions.length === 1 ? '' : 's'} in the file, ${fresh} not on this phone yet. Workouts already here are not changed.`,
        actions: [
          { label: 'Restore workouts', value: 'sessions' as const, kind: 'accent' },
          { label: 'Restore workouts and replace plan', value: 'all' as const },
        ],
      });
      if (!what) return;
      await report(await restoreBackup(backup, what === 'all'), backup.sessions.length);
    } catch (e) {
      await tell('Restore failed', e instanceof Error ? e.message : String(e));
    }
  };

  const fromSheet = async () => {
    setBusy(true);
    try {
      const found = await fetchSheetSessions(settings, plan);
      const fresh = (await newSessions(found)).length;
      if (fresh === 0) return await report(0, found.length);
      const go = await ask(`Restore ${fresh} workout${fresh === 1 ? '' : 's'} from your Google Sheet?`, {
        body: `${found.length} in the sheet, ${fresh} not on this phone yet. Workouts already here are not changed.`,
        confirm: 'Restore workouts',
      });
      if (go) await report(await importSessions(found), found.length);
    } catch (e) {
      await tell('Restore failed', e instanceof Error ? (e.name === 'AbortError' ? 'The sheet did not answer in time. Try again.' : e.message) : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card form">
      <h2>Backup</h2>
      <p className="small">
        {sessions.length === 0
          ? 'No workouts logged yet.'
          : configured
            ? queued === 0
              ? `All ${sessions.length} workouts are in your Google Sheet.`
              : `${sessions.length - queued} of ${sessions.length} workouts are in your Google Sheet. ${queued} waiting to sync.`
            : open === 0
              ? `All ${sessions.length} workouts have a copy outside this phone.`
              : `${open} of ${sessions.length} workouts are saved only on this phone.`}
      </p>
      <p className="small muted">
        Last backup file: {backedUpAt ? fmtDate(backedUpAt) : 'never'}.
        {persisted === false && " The browser may clear this app's data when the phone runs low on space. Add the app to the Home Screen and keep a backup."}
      </p>
      <div className="btn-row">
        <button type="button" className="btn btn-accent" disabled={sessions.length === 0} onClick={() => void save()}>
          Save backup file
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => void fromFile()}>
          Restore from file
        </button>
      </div>
      {configured && (
        <button type="button" className="btn btn-secondary btn-block" disabled={busy} onClick={() => void fromSheet()}>
          {busy ? 'Reading the sheet…' : 'Restore from Google Sheet'}
        </button>
      )}
      <p className="small muted">The backup file holds every workout, your plan and your settings (not the sync token). Keep it outside this phone, for example in iCloud or Google Drive.</p>
    </section>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="toggle" onClick={() => onChange(!checked)}>
      <span>{label}</span>
      <span className={`switch ${checked ? 'on' : ''}`} />
    </button>
  );
}

function PlanEditor({ plan }: { plan: Plan }) {
  const [dayId, setDayId] = useState(plan.days[0]?.id ?? '');
  const [editing, setEditing] = useState<PlanExercise | null>(null);
  const day = plan.days.find((d) => d.id === dayId) ?? plan.days[0];

  const saveDay = (next: PlanDay) => void savePlan({ days: plan.days.map((d) => (d.id === next.id ? next : d)) });

  const move = (i: number, d: -1 | 1) => {
    const ex = [...day.exercises];
    const j = i + d;
    if (j < 0 || j >= ex.length) return;
    [ex[i], ex[j]] = [ex[j], ex[i]];
    saveDay({ ...day, exercises: ex });
  };

  const moveDay = (d: -1 | 1) => {
    const days = [...plan.days];
    const i = days.findIndex((x) => x.id === day.id);
    const j = i + d;
    if (j < 0 || j >= days.length) return;
    [days[i], days[j]] = [days[j], days[i]];
    void savePlan({ days });
  };

  const addDay = () => {
    const nd: PlanDay = { id: uid('day'), label: 'Day', name: 'New day', exercises: [] };
    void savePlan({ days: [...plan.days, nd] });
    setDayId(nd.id);
  };

  const deleteDay = async () => {
    if (!(await ask(`Delete the day "${day.name}"?`, { body: 'Its exercise list is deleted. Logged workouts are kept.', confirm: 'Delete day', danger: true }))) return;
    const days = plan.days.filter((d) => d.id !== day.id);
    void savePlan({ days });
    setDayId(days[0]?.id ?? '');
  };

  const newExercise = (): PlanExercise => ({
    id: uid(`${day.id}--ex`),
    name: '',
    sets: 3,
    repMin: 8,
    repMax: 12,
    startWeight: null,
    rest: 'isolation',
    restSeconds: null,
    kind: 'weight',
    increment: 2.5,
    note: '',
    primaryMuscles: [],
    secondaryMuscles: [],
  });

  const saveExercise = (ex: PlanExercise) => {
    const exists = day.exercises.some((e) => e.id === ex.id);
    saveDay({ ...day, exercises: exists ? day.exercises.map((e) => (e.id === ex.id ? ex : e)) : [...day.exercises, ex] });
    setEditing(null);
  };

  return (
    <section className="card form">
      <h2>Training plan</h2>
      <div className="pills">
        {plan.days.map((d) => (
          <button type="button" key={d.id} className={`pill ${d.id === day?.id ? 'on' : ''}`} onClick={() => setDayId(d.id)}>
            {d.label} · {d.name}
          </button>
        ))}
        <button type="button" className="pill" onClick={addDay}>
          + Day
        </button>
      </div>

      {day && (
        <>
          <div className="input-row">
            <label className="field narrow">
              <span className="muted">Label</span>
              <TextField value={day.label} onCommit={(label) => saveDay({ ...day, label })} />
            </label>
            <label className="field">
              <span className="muted">Day name</span>
              <TextField value={day.name} onCommit={(name) => saveDay({ ...day, name })} />
            </label>
          </div>
          <div className="btn-row">
            <button type="button" className="btn btn-small btn-secondary" onClick={() => moveDay(-1)}>
              Move day earlier
            </button>
            <button type="button" className="btn btn-small btn-secondary" onClick={() => moveDay(1)}>
              Move day later
            </button>
          </div>

          <ol className="ex-list">
            {day.exercises.map((ex, i) => (
              <li key={ex.id}>
                <button type="button" className="ex-list-main" onClick={() => setEditing(ex)}>
                  <span>{ex.name}</span>
                  <span className="muted small">
                    {ex.sets} × {ex.repMin}–{ex.repMax} · {ex.startWeight ?? '–'} kg · {ex.rest}
                    {ex.kind !== 'weight' ? ` · ${ex.kind}` : ''}
                  </span>
                </button>
                <button type="button" className="icon-btn" aria-label={`Move ${ex.name} up`} onClick={() => move(i, -1)}>
                  ↑
                </button>
                <button type="button" className="icon-btn" aria-label={`Move ${ex.name} down`} onClick={() => move(i, 1)}>
                  ↓
                </button>
                <button
                  type="button"
                  className="icon-btn danger"
                  aria-label={`Remove ${ex.name}`}
                  onClick={async () =>
                    (await ask(`Remove ${ex.name} from ${day.name}?`, { body: 'Its logged history is kept.', confirm: 'Remove exercise', danger: true })) &&
                    saveDay({ ...day, exercises: day.exercises.filter((e) => e.id !== ex.id) })
                  }
                >
                  ✕
                </button>
              </li>
            ))}
          </ol>
          <button type="button" className="btn btn-secondary btn-block" onClick={() => setEditing(newExercise())}>
            + Add exercise
          </button>
          <button type="button" className="btn btn-danger-text btn-block" onClick={() => void deleteDay()}>
            Delete this day
          </button>
        </>
      )}

      <button
        type="button"
        className="btn btn-danger-text btn-block"
        onClick={async () => (await ask('Reset the plan to the default?', { body: 'Your days and exercises are replaced. Logged workouts are kept.', confirm: 'Reset plan', danger: true })) && void savePlan(seedPlan())}
      >
        Reset plan to default
      </button>

      {editing && <ExerciseEditor initial={editing} onSave={saveExercise} onCancel={() => setEditing(null)} />}
    </section>
  );
}

function ExerciseEditor({ initial, onSave, onCancel }: { initial: PlanExercise; onSave: (ex: PlanExercise) => void; onCancel: () => void }) {
  const [ex, setEx] = useState(initial);
  const [weightText, setWeightText] = useState(initial.startWeight === null ? '' : String(initial.startWeight));
  const [restText, setRestText] = useState(initial.restSeconds === null ? '' : String(initial.restSeconds));
  const p = (patch: Partial<PlanExercise>) => setEx({ ...ex, ...patch });

  const cycleMuscle = (mu: Muscle) => {
    const without = (list: Muscle[]) => list.filter((x) => x !== mu);
    if (ex.primaryMuscles.includes(mu)) p({ primaryMuscles: without(ex.primaryMuscles), secondaryMuscles: [...ex.secondaryMuscles, mu] });
    else if (ex.secondaryMuscles.includes(mu)) p({ secondaryMuscles: without(ex.secondaryMuscles) });
    else p({ primaryMuscles: [...ex.primaryMuscles, mu] });
  };

  const save = () => {
    const name = ex.name.trim();
    if (!name) return void tell('Give the exercise a name');
    const w = parseFloat(weightText.replace(',', '.'));
    const r = parseInt(restText, 10);
    onSave({
      ...ex,
      name,
      id: ex.id || slug(name),
      repMax: Math.max(ex.repMin, ex.repMax),
      startWeight: Number.isFinite(w) ? w : null,
      restSeconds: Number.isFinite(r) && r > 0 ? r : null,
    });
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Edit exercise">
      <div className="modal-sheet form">
        <h2>{initial.name ? 'Edit exercise' : 'New exercise'}</h2>
        <label className="field">
          <span className="muted">Name (history is matched by name)</span>
          <input value={ex.name} onChange={(e) => p({ name: e.target.value })} />
        </label>
        <Stepper label="Sets" value={ex.sets} step={1} min={1} onChange={(sets) => p({ sets })} />
        <div className="steppers">
          <Stepper label="Min reps" value={ex.repMin} step={1} min={1} onChange={(repMin) => p({ repMin })} />
          <Stepper label="Max reps" value={ex.repMax} step={1} min={1} onChange={(repMax) => p({ repMax })} />
        </div>
        <div className="input-row">
          <label className="field">
            <span className="muted">Starting weight (kg, blank = find it)</span>
            <input inputMode="decimal" value={weightText} onChange={(e) => setWeightText(e.target.value)} />
          </label>
        </div>
        <Stepper label="Weight step (kg)" decimal value={ex.increment} step={0.25} min={0.25} onChange={(increment) => p({ increment })} />
        <label className="field">
          <span className="muted">Load type</span>
          <select value={ex.kind} onChange={(e) => p({ kind: e.target.value as LoadKind })}>
            <option value="weight">Weight (more = harder)</option>
            <option value="assist">Assist (less = harder)</option>
            <option value="bodyweight">Bodyweight (make it harder)</option>
          </select>
        </label>
        <label className="field">
          <span className="muted">Rest type</span>
          <select value={ex.rest} onChange={(e) => p({ rest: e.target.value as RestType })}>
            <option value="compound">Compound</option>
            <option value="isolation">Isolation</option>
          </select>
        </label>
        <label className="field">
          <span className="muted">Rest override in seconds (blank = use rest type)</span>
          <input inputMode="numeric" value={restText} onChange={(e) => setRestText(e.target.value)} />
        </label>
        <div className="field">
          <span className="muted">Muscles: tap to cycle off → primary → secondary</span>
          <div className="muscle-pick">
            {MUSCLES.map((mu) => {
              const state = ex.primaryMuscles.includes(mu) ? 'primary' : ex.secondaryMuscles.includes(mu) ? 'secondary' : 'off';
              return (
                <button type="button" key={mu} className={`pill muscle-${state}`} aria-label={`${MUSCLE_LABEL[mu]}: ${state}`} onClick={() => cycleMuscle(mu)}>
                  {MUSCLE_LABEL[mu]}
                  {state !== 'off' && <span className="muscle-tag">{state === 'primary' ? '1' : '½'}</span>}
                </button>
              );
            })}
          </div>
          {ex.primaryMuscles.length + ex.secondaryMuscles.length === 0 && defaultMuscles(ex.name).primaryMuscles.length > 0 && (
            <button type="button" className="btn btn-small btn-secondary" onClick={() => p(defaultMuscles(ex.name))}>
              Use suggested muscles for this name
            </button>
          )}
        </div>
        <label className="field">
          <span className="muted">Form note</span>
          <textarea rows={3} value={ex.note} onChange={(e) => p({ note: e.target.value })} />
        </label>
        <div className="btn-row">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-accent" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
