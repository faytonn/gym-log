import { useEffect, useState } from 'react';
import { roundKg } from '../progression';

interface Props {
  label: string;
  value: number;
  step: number;
  min?: number;
  unit?: string;
  decimal?: boolean;
  onChange: (v: number) => void;
}

/** Big −/+ stepper. The number itself is tappable to type an exact value. */
export function Stepper({ label, value, step, min = 0, unit, decimal, onChange }: Props) {
  const [text, setText] = useState(String(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(String(value));
  }, [value, editing]);

  const set = (v: number) => onChange(Math.max(min, roundKg(v)));

  const commit = () => {
    setEditing(false);
    const n = parseFloat(text.replace(',', '.'));
    if (Number.isFinite(n)) set(n);
    else setText(String(value));
  };

  return (
    <div className="stepper">
      <span className="stepper-label">{label}</span>
      <div className="stepper-row">
        <button type="button" className="step-btn" aria-label={`${label} minus ${step}`} onClick={() => set(value - step)}>
          −
        </button>
        <label className="step-value">
          <input
            value={text}
            inputMode={decimal ? 'decimal' : 'numeric'}
            enterKeyHint="done"
            aria-label={label}
            onFocus={(e) => {
              setEditing(true);
              e.target.select();
            }}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          {unit && <span className="unit">{unit}</span>}
        </label>
        <button type="button" className="step-btn" aria-label={`${label} plus ${step}`} onClick={() => set(value + step)}>
          +
        </button>
      </div>
    </div>
  );
}
