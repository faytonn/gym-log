import { useEffect, useState } from 'react';
import { roundKg } from '../progression';

interface Props {
  label: string;
  value: number;
  onChange: (v: number) => void;
}

/** Large tap-to-type weight field. Opens the decimal keypad and selects the old value so typing replaces it. */
export function WeightField({ label, value, onChange }: Props) {
  const [text, setText] = useState(String(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(String(value));
  }, [value, editing]);

  const parse = (s: string) => {
    const n = parseFloat(s.replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? roundKg(n) : null;
  };

  return (
    <label className="weight-field">
      <span className="stepper-label">{label}</span>
      <span className="weight-box">
        <input
          value={text}
          inputMode="decimal"
          enterKeyHint="done"
          autoComplete="off"
          aria-label={label}
          onFocus={(e) => {
            setEditing(true);
            e.target.select();
          }}
          onChange={(e) => {
            setText(e.target.value);
            // Save while typing, so "Save set" works even if the keyboard is still open.
            const n = parse(e.target.value);
            if (n !== null) onChange(n);
          }}
          onBlur={() => {
            setEditing(false);
            if (parse(text) === null) setText(String(value));
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <span className="unit">kg</span>
      </span>
    </label>
  );
}
