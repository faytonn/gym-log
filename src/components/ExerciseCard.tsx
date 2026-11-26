import { useState } from 'react';
import { MUSCLE_LABEL, type Muscle } from '../muscles';
import { fmtKg, nextHint, setDelta, type LastEntry } from '../progression';
import type { ActiveEntry, PlanExercise } from '../types';
import { fmtDate, fmtDuration } from '../workout';
import { BodyMap, type MapLevel } from './BodyMap';
import { ask } from './Dialog';
import { RepWheel } from './RepWheel';
import { Sparkline } from './Sparkline';
import { WeightField } from './WeightField';

interface Props {
  index: number;
  ex: PlanExercise;
  entry: ActiveEntry;
  last: LastEntry | null;
  /** Scores of the last few sessions, oldest first, for the trend line. */
  trend: number[];
  restSeconds: number;
  expanded: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<ActiveEntry>) => void;
  onSaveSet: () => void;
  onDeleteSet: (i: number) => void;
}

const RIR = [0, 1, 2, 3, 4, 5];
const MAP_KEY = 'gym-log:show-muscle-map';

function weightLabel(ex: PlanExercise): string {
  if (ex.kind === 'assist') return 'Assist kg';
  if (ex.kind === 'bodyweight') return 'Added kg';
  return 'Weight kg';
}

function readMapPref(): boolean {
  try {
    return localStorage.getItem(MAP_KEY) === '1';
  } catch {
    return false;
  }
}

const names = (list: Muscle[]) => list.map((m) => MUSCLE_LABEL[m]).join(', ');

function Muscles({ ex }: { ex: PlanExercise }) {
  const [open, setOpen] = useState(readMapPref);
  const primary = ex.primaryMuscles ?? [];
  const secondary = (ex.secondaryMuscles ?? []).filter((m) => !primary.includes(m));
  if (primary.length + secondary.length === 0) return null;

  const levels: Partial<Record<Muscle, MapLevel>> = {};
  for (const m of secondary) levels[m] = 'secondary';
  for (const m of primary) levels[m] = 'primary';
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(MAP_KEY, next ? '1' : '0');
    } catch {
      /* preference only */
    }
  };

  return (
    <div className="muscles">
      <button type="button" className="muscles-head" onClick={toggle} aria-expanded={open}>
        <span className="muscles-text">
          <span className="lab">Muscles</span>
          <span>
            {names(primary)}
            {secondary.length > 0 && <span className="muted"> + {names(secondary)}</span>}
          </span>
        </span>
        <span className="lab" aria-hidden="true">
          {open ? 'Hide map' : 'Map'}
        </span>
      </button>
      {open && (
        <BodyMap
          compact
          levels={levels}
          detail={(m) => (primary.includes(m) ? 'primary' : secondary.includes(m) ? 'secondary' : 'not targeted')}
          caption={
            <span className="map-key">
              <span className="map-key-item">
                <span className="key-swatch bm-primary" /> Primary
              </span>
              <span className="map-key-item">
                <span className="key-swatch bm-secondary" /> Secondary
              </span>
            </span>
          }
        />
      )}
    </div>
  );
}

export function ExerciseCard({ index, ex, entry, last, trend, restSeconds, expanded, onToggle, onChange, onSaveSet, onDeleteSet }: Props) {
  const hint = nextHint(ex, last?.entry ?? null);
  const done = entry.sets.length >= ex.sets;
  const setNo = entry.sets.length + 1;
  const showSuggestion = hint.suggestedWeight !== null && hint.suggestedWeight !== entry.weight && entry.sets.length === 0;
  const primary = ex.primaryMuscles ?? [];
  const rows = Math.max(ex.sets, entry.sets.length);
  const lastSets = last?.entry.sets ?? [];

  return (
    <section className={`panel ex-card ${done ? 'ex-done' : ''} ${expanded ? 'ticks' : ''}`} id={`ex-${ex.id}`}>
      <button type="button" className="ex-head" onClick={onToggle} aria-expanded={expanded}>
        <span className="ex-title">
          <span className="lab">
            {String(index + 1).padStart(2, '0')} · {primary.length > 0 ? `${names(primary)} · ` : ''}
            {ex.sets} × {ex.repMin}–{ex.repMax}
          </span>
          <span className="ex-name">{ex.name}</span>
        </span>
        <Sparkline values={trend} />
        <span className="ex-count">{done ? 'OK' : `${entry.sets.length}/${ex.sets}`}</span>
      </button>

      {expanded && (
        <div className="ex-body">
          {ex.note && <p className="ex-note">{ex.note}</p>}
          <Muscles ex={ex} />

          <div className="readout">
            <span className="lab">
              {last
                ? `Last · ${fmtDate(last.session.finishedAt)}${last.entry.rir !== null ? ` · ${last.entry.rir} left in tank` : ''}`
                : `Not logged yet · rest ${fmtDuration(restSeconds * 1000)}`}
            </span>
            {Array.from({ length: rows }, (_, i) => {
              const set = entry.sets[i];
              const prev = lastSets[i];
              if (set) {
                const d = setDelta(ex.kind, set, prev);
                return (
                  <button
                    type="button"
                    key={i}
                    className="line line-done"
                    aria-label={`Set ${i + 1}: ${fmtKg(set.weight)} kg, ${set.reps} reps. Tap to delete`}
                    onClick={async () => {
                      if (await ask(`Delete set ${i + 1}?`, { body: `${fmtKg(set.weight)} kg × ${set.reps}`, confirm: 'Delete set', danger: true })) onDeleteSet(i);
                    }}
                  >
                    <span className="line-k">S{i + 1}</span>
                    <span>
                      {fmtKg(set.weight)} × {set.reps}
                    </span>
                    <span className={d?.better ? 'up' : 'flat'}>{d?.text ?? ''}</span>
                    <span className="up">OK</span>
                  </button>
                );
              }
              return (
                <div key={i} className={`line ${i === entry.sets.length ? 'line-now' : 'line-pending'}`}>
                  <span className="line-k">S{i + 1}</span>
                  <span>{prev ? `last ${fmtKg(prev.weight)} × ${prev.reps}` : '—'}</span>
                  <span />
                  <span>{i === entry.sets.length ? 'NOW' : '··'}</span>
                </div>
              );
            })}
          </div>

          <div className={`hint hint-${hint.kind}`}>
            <div>
              <span className="lab">Target</span>
              <div className="hint-text">{hint.text}</div>
              <div className="hint-detail">{hint.detail}</div>
            </div>
            {showSuggestion && (
              <button type="button" className="btn btn-small" onClick={() => onChange({ weight: hint.suggestedWeight! })}>
                Use {fmtKg(hint.suggestedWeight!)}
              </button>
            )}
          </div>

          <div className="entry-row">
            <WeightField label={weightLabel(ex)} value={entry.weight} onChange={(weight) => onChange({ weight })} />
            <RepWheel label="Reps · swipe" value={entry.reps} max={Math.max(30, ex.repMax + 10)} rangeMin={ex.repMin} rangeMax={ex.repMax} onChange={(reps) => onChange({ reps })} />
          </div>

          <button type="button" className={`btn btn-save ${done ? 'btn-secondary' : ''}`} onClick={onSaveSet}>
            {done ? `+ Extra set ${setNo}` : `Save set ${setNo} of ${ex.sets}`}
          </button>

          <div className="rir">
            <span className="lab">Reps left in tank</span>
            <div className="rir-row" role="radiogroup" aria-label="Reps left in tank">
              {RIR.map((n) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={entry.rir === n}
                  key={n}
                  className={`rir-btn ${entry.rir === n ? 'on' : ''}`}
                  onClick={() => onChange({ rir: entry.rir === n ? null : n })}
                >
                  {n === 5 ? '5+' : n}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
