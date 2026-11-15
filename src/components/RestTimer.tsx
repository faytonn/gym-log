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

const SEGMENTS = 15;

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
  const elapsed = total > 0 ? Math.min(1, Math.max(0, 1 - left / (total * 1000))) : 1;
  const filled = Math.round(elapsed * SEGMENTS);

  return (
    <div className={`rest ${done ? 'rest-done' : ''}`} role="timer" aria-live="off" aria-label={done ? 'Rest over' : `Rest, ${fmtDuration(left)} left`}>
      <div className="rest-r1">
        <span className="lab">{done ? 'Rest over' : `Rest · ${fmtDuration(total * 1000)}`}</span>
        <span className="rest-clock">{done ? 'GO' : fmtDuration(left)}</span>
      </div>
      <div className="segs" aria-hidden="true">
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <i key={i} className={i < filled ? 'f' : ''} />
        ))}
      </div>
      <div className="rest-r2">
        <button type="button" onClick={() => onAdjust(-15)}>
          −15
        </button>
        <button type="button" onClick={() => onAdjust(15)}>
          +15
        </button>
        <button type="button" className="rest-skip" onClick={onSkip}>
          {done ? 'OK' : 'Skip'}
        </button>
      </div>
    </div>
  );
}
