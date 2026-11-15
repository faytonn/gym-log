import { useEffect, useLayoutEffect, useRef } from 'react';

interface Props {
  label: string;
  value: number;
  max: number;
  /** Values in this range are marked as the target rep range. */
  rangeMin?: number;
  rangeMax?: number;
  onChange: (v: number) => void;
}

const ITEM = 52; // px per number; keep in sync with .wheel-item width

/** Horizontal number strip: swipe to scroll, it snaps to the centre value. Tapping a number also selects it. */
export function RepWheel({ label, value, max, rangeMin, rangeMax, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const count = Math.max(max, value) + 1;
  const latest = useRef(value);
  latest.current = value;
  const emit = useRef(onChange);
  emit.current = onChange;

  // Keep the strip on the current value when it changes from outside (prefill after saving a set).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (Math.round(el.scrollLeft / ITEM) !== value) el.scrollLeft = value * ITEM;
  }, [value, count]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const v = Math.min(count - 1, Math.max(0, Math.round(el.scrollLeft / ITEM)));
        if (v !== latest.current) emit.current(v);
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [count]);

  return (
    <div className="wheel">
      <span className="stepper-label">{label}</span>
      <div className="wheel-frame">
        <div
          className="wheel-strip"
          ref={ref}
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={count - 1}
          aria-valuenow={value}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange(Math.min(count - 1, value + 1));
            if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange(Math.max(0, value - 1));
          }}
        >
          {Array.from({ length: count }, (_, n) => (
            <button
              type="button"
              key={n}
              tabIndex={-1}
              className={`wheel-item ${n === value ? 'on' : ''} ${rangeMin !== undefined && rangeMax !== undefined && n >= rangeMin && n <= rangeMax ? 'in-range' : ''}`}
              onClick={() => ref.current?.scrollTo({ left: n * ITEM, behavior: 'smooth' })}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="wheel-marker" aria-hidden="true" />
      </div>
    </div>
  );
}
