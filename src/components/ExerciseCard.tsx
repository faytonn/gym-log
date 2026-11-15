import { fmtKg, nextHint, workingWeight, type LastEntry } from '../progression';
import { useState } from 'react';
import type { ActiveEntry, PlanExercise } from '../types';
import { fmtDate, fmtDuration } from '../workout';
import { MUSCLE_LABEL, type Muscle } from '../muscles';
import { BodyMap, type MapLevel } from './BodyMap';
import { RepWheel } from './RepWheel';
import { WeightField } from './WeightField';

interface Props {
  index: number;
  ex: PlanExercise;
  entry: ActiveEntry;
  last: LastEntry | null;
  restSeconds: number;
  expanded: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<ActiveEntry>) => void;
  onSaveSet: () => void;
  onDeleteSet: (i: number) => void;
}

const RIR = [0, 1, 2, 3, 4, 5];
const MAP_KEY = 'gym-log:show-muscle-map';

function readMapPref(): boolean {
  try {
    return localStorage.getItem(MAP_KEY) === '1';
  } catch {
    return false;
  }
}

function Muscles({ ex }: { ex: PlanExercise }) {
  const [open, setOpen] = useState(readMapPref);
  const primary = ex.primaryMuscles ?? [];
  const secondary = (ex.secondaryMuscles ?? []).filter((m) => !primary.includes(m));
  if (primary.length + secondary.length === 0) return null;

  const levels: Partial<Record<Muscle, MapLevel>> = {};
  for (const m of secondary) levels[m] = 'secondary';
  for (const m of primary) levels[m] = 'primary';
  const names = (list: Muscle[]) => list.map((m) => MUSCLE_LABEL[m]).join(', ');
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
          <span className="muted">Muscles</span>
          <span>
            <strong>{names(primary)}</strong>
            {secondary.length > 0 && <span className="muted"> + {names(secondary)}</span>}
          </span>
        </span>
        <span className="chev" aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <BodyMap
          compact
          levels={levels}
          detail={(m) => (primary.includes(m) ? 'primary' : secondary.includes(m) ? 'secondary' : 'not targeted')}
          caption={
            <span className="map-key">
              <span className="key-swatch bm-primary" /> Primary <span className="key-swatch bm-secondary" /> Secondary
            </span>
          }
        />
      )}
    </div>
  );
}

function weightLabel(ex: PlanExercise): string {
  if (ex.kind === 'assist') return 'Assist';
  if (ex.kind === 'bodyweight') return 'Added weight';
  return 'Weight';
}

export function ExerciseCard({ index, ex, entry, last, restSeconds, expanded, onToggle, onChange, onSaveSet, onDeleteSet }: Props) {
  const hint = nextHint(ex, last?.entry ?? null);
  const done = entry.sets.length >= ex.sets;
  const setNo = entry.sets.length + 1;
  const showSuggestion = hint.suggestedWeight !== null && hint.suggestedWeight !== entry.weight && entry.sets.length === 0;

  return (
    <section className={`card ex-card ${done ? 'ex-done' : ''}`} id={`ex-${ex.id}`}>
      <button type="button" className="ex-head" onClick={onToggle} aria-expanded={expanded}>
        <span className="ex-index">{done ? '✓' : index + 1}</span>
        <span className="ex-title">
          <span className="ex-name">{ex.name}</span>
          <span className="ex-meta">
            {ex.sets} × {ex.repMin}–{ex.repMax} · {ex.rest === 'compound' ? 'Compound' : 'Isolation'} · rest {fmtDuration(restSeconds * 1000)}
          </span>
        </span>
        <span className="ex-count">
          {entry.sets.length}/{ex.sets}
        </span>
      </button>

      {expanded && (
        <div className="ex-body">
          {ex.note && <p className="ex-note">{ex.note}</p>}
          <Muscles ex={ex} />

          <div className="ex-last">
            <span className="muted">Last time</span>
            {last ? (
              <span>
                <strong>{fmtKg(workingWeight(last.entry.sets)!)} kg</strong>
                {ex.kind === 'assist' && ' assist'} · {last.entry.sets.map((s) => s.reps).join(' · ')}
                {last.entry.rir !== null && <span className="muted"> · {last.entry.rir} left</span>}
                <span className="muted"> · {fmtDate(last.session.finishedAt)}</span>
              </span>
            ) : (
              <span className="muted">Not logged yet</span>
            )}
          </div>

          <div className={`hint hint-${hint.kind}`}>
            <div>
              <div className="hint-text">{hint.text}</div>
              <div className="hint-detail">{hint.detail}</div>
            </div>
            {showSuggestion && (
              <button type="button" className="btn btn-small" onClick={() => onChange({ weight: hint.suggestedWeight! })}>
                Use {fmtKg(hint.suggestedWeight!)}
              </button>
            )}
          </div>

          {entry.sets.length > 0 && (
            <div className="sets">
              {entry.sets.map((s, i) => (
                <button
                  type="button"
                  key={i}
                  className="set-chip"
                  onClick={() => {
                    if (confirm(`Delete set ${i + 1} (${fmtKg(s.weight)} kg × ${s.reps})?`)) onDeleteSet(i);
                  }}
                >
                  <span className="muted">{i + 1}</span> {fmtKg(s.weight)}×{s.reps}
                </button>
              ))}
            </div>
          )}

          <div className="entry-row">
            <WeightField label={weightLabel(ex)} value={entry.weight} onChange={(weight) => onChange({ weight })} />
            <RepWheel label="Reps · swipe" value={entry.reps} max={Math.max(30, ex.repMax + 10)} rangeMin={ex.repMin} rangeMax={ex.repMax} onChange={(reps) => onChange({ reps })} />
          </div>

          <button type="button" className={`btn btn-save ${done ? 'btn-secondary' : ''}`} onClick={onSaveSet}>
            {done ? `+ Extra set ${setNo}` : `Save set ${setNo} of ${ex.sets}`}
          </button>

          <div className="rir">
            <span className="muted">Reps left in tank</span>
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
