// Small wrappers around device APIs that iOS only partly supports. Every call fails silently.

let ctx: AudioContext | null = null;

/**
 * iOS only lets Web Audio play after a user gesture. Call this from a tap handler
 * (e.g. "Save set") so the beep at the end of the rest timer is allowed to play.
 */
export function unlockAudio(): void {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    // Play one silent sample: required by some iOS versions to fully unlock.
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  } catch {
    /* no audio */
  }
}

export function beep(): void {
  try {
    // Safari 16.4+: a "transient" session plays over music (ducking it) instead of stopping it.
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = 'transient';
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = i === 2 ? 1320 : 880;
      const start = t0 + i * 0.28;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.6, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.24);
    }
  } catch {
    /* no audio */
  }
}

/** navigator.vibrate is not available in iOS Safari; this does nothing there. */
export function vibrate(pattern: number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}

type Sentinel = { release(): Promise<void> };
let lock: Sentinel | null = null;

/** Keeps the screen on during a workout so the timer can beep. iOS 16.4+ in Safari, 18.4+ for home-screen apps. */
export async function keepAwake(on: boolean): Promise<void> {
  try {
    const wl = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<Sentinel> } }).wakeLock;
    if (on && wl && !lock && document.visibilityState === 'visible') {
      lock = await wl.request('screen');
      (lock as unknown as EventTarget).addEventListener?.('release', () => (lock = null));
    } else if (!on && lock) {
      await lock.release();
      lock = null;
    }
  } catch {
    lock = null;
  }
}
