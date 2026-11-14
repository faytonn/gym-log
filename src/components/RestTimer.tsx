import { useEffect, useRef, useState } from 'react';
import { beep, vibrate } from '../device';
import { fmtDuration } from '../workout';

interface Props {
  endsAt: number | null;
  total: number;
  sound: boolean;
  onAdjust: (deltaSeconds: number) => void;
  onSkip: () => void;
}

/**
 * Countdown based on an absolute end time (persisted with the session), so it stays correct
 * after the phone locks or the app is closed and reopened.
 */
export function RestTimer({ endsAt, total, sound, onAdjust, onSkip }: Props) {
  const [now, setNow] = useState(Date.now());
  const firedFor = useRef<number | null>(null);

  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt]);

  const left = endsAt ? endsAt - now : 0;

  useEffect(() => {
    if (!endsAt || left > 0 || firedFor.current === endsAt) return;
    firedFor.current = endsAt;
    // Only alert if we are close to the end; reopening the app 20 minutes later should not beep.
    if (now - endsAt < 30_000) {
      if (sound) beep();
      vibrate([300, 150, 300]);
    }
    const id = setTimeout(onSkip, 4000);
    return () => clearTimeout(id);
  }, [endsAt, left, now, sound, onSkip]);

  if (!endsAt) return null;
  const done = left <= 0;
  const pct = total > 0 ? Math.min(100, Math.max(0, (1 - left / (total * 1000)) * 100)) : 100;

  return (
    <div className={`rest ${done ? 'rest-done' : ''}`} role="timer" aria-live="polite">
      <div className="rest-bar" style={{ width: `${pct}%` }} />
      <button type="button" className="rest-adj" onClick={() => onAdjust(-15)}>
        −15
      </button>
      <div className="rest-time">
        <span className="rest-label">{done ? 'Rest over' : 'Rest'}</span>
        <span className="rest-clock">{done ? 'Go!' : fmtDuration(left)}</span>
      </div>
      <button type="button" className="rest-adj" onClick={() => onAdjust(15)}>
        +15
      </button>
      <button type="button" className="rest-skip" onClick={onSkip}>
        {done ? 'OK' : 'Skip'}
      </button>
    </div>
  );
}
