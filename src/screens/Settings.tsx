import { useState } from 'react';
import { Stepper } from '../components/Stepper';
import { TextField } from '../components/TextField';
import { savePlan, saveSettings } from '../db';
import { MUSCLES, MUSCLE_LABEL, defaultMuscles, type Muscle } from '../muscles';
import { seedPlan, slug } from '../seed';
import { testConnection } from '../sync';
import type { LoadKind, Plan, PlanDay, PlanExercise, RestType, Settings } from '../types';
import { fmtDuration } from '../workout';

interface Props {
  plan: Plan;
  settings: Settings;
  pending: number;
  syncing: boolean;
  syncLabel: string | null;
  onSync: () => void;
  onBack: () => void;
}

function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function SettingsScreen({ plan, settings, pending, syncing, syncLabel, onSync, onBack }: Props) {
  const set = (patch: Partial<Settings>) => void saveSettings({ ...settings, ...patch });
  const [test, setTest] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);

  const runTest = async () => {
    setTest('Testing…');
    try {
      setTest(`✓ ${await testConnection(settings)}`);
    } catch (e) {
      setTest(`✗ ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="screen">
      <header className="topbar">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back to home">
          ‹
        </button>
        <div className="topbar-title">
          <span>Settings</span>
        </div>
        <span className="icon-btn" />
      </header>

      <div className="cards">
        <section className="card form">
          <h2>Google Sheets sync</h2>
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
              <TextField
                type={showToken ? 'text' : 'password'}
                autoCapitalize="off"
                autoCorrect="off"
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

  const deleteDay = () => {
    if (!confirm(`Delete the day "${day.name}" and its exercise list? Logged history is kept.`)) return;
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
                  onClick={() => confirm(`Remove ${ex.name} from ${day.name}? Its history is kept.`) && saveDay({ ...day, exercises: day.exercises.filter((e) => e.id !== ex.id) })}
                >
                  ✕
                </button>
              </li>
            ))}
          </ol>
          <button type="button" className="btn btn-secondary btn-block" onClick={() => setEditing(newExercise())}>
            + Add exercise
          </button>
          <button type="button" className="btn btn-danger-text btn-block" onClick={deleteDay}>
            Delete this day
          </button>
        </>
      )}

      <button
        type="button"
        className="btn btn-danger-text btn-block"
        onClick={() => confirm('Replace your plan with the default plan? Logged workouts are kept.') && void savePlan(seedPlan())}
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
    if (!name) return alert('Give the exercise a name.');
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
