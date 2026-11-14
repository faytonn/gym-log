import { fmtKg, nextHint, workingWeight, type LastEntry } from '../progression';
import type { ActiveEntry, PlanExercise } from '../types';
import { fmtDate, fmtDuration } from '../workout';
import { Stepper } from './Stepper';

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

          <div className="steppers">
            <Stepper label={weightLabel(ex)} unit="kg" decimal value={entry.weight} step={ex.increment} onChange={(weight) => onChange({ weight })} />
            <Stepper label="Reps" value={entry.reps} step={1} onChange={(reps) => onChange({ reps })} />
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
