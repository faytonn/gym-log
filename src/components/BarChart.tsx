import { useState } from 'react';
import { niceTicks } from './LineChart';

export interface Bar {
  /** Short label under the bar, e.g. "9 Nov". */
  label: string;
  value: number;
  /** Text for the readout, e.g. "41 sets". */
  detail: string;
}

interface Props {
  title: string;
  bars: Bar[];
}

const W = 340;
const H = 150;
const PAD = { l: 38, r: 8, t: 12, b: 22 };

/** Single-series bar chart from zero. Tap a bar to read its value. */
export function BarChart({ title, bars }: Props) {
  const [sel, setSel] = useState<number | null>(null);
  if (bars.length === 0) return null;

  const max = Math.max(1, ...bars.map((b) => b.value));
  const ticks = niceTicks(0, max);
  const top = Math.max(max, ticks[ticks.length - 1] ?? max);
  const band = (W - PAD.l - PAD.r) / bars.length;
  const bw = Math.min(30, band - 4);
  const y = (v: number) => PAD.t + (1 - v / top) * (H - PAD.t - PAD.b);
  const shown = sel ?? bars.length - 1;
  const every = bars.length > 6 ? 2 : 1;

  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setSel(Math.min(bars.length - 1, Math.max(0, Math.floor((px - PAD.l) / band))));
  };

  return (
    <figure className="chart">
      <figcaption>
        <span className="chart-title">{title}</span>
        <span className="chart-readout">
          {bars[shown].label} · <strong>{bars[shown].detail}</strong>
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}, ${bars.length} weeks`} onPointerDown={pick} onPointerMove={(e) => e.buttons && pick(e)}>
        {ticks.map((v) => (
          <g key={v}>
            <line className="chart-grid" x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} />
            <text className="chart-axis" x={PAD.l - 6} y={y(v)} dy="0.32em" textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {bars.map((b, i) => {
          const x = PAD.l + i * band + (band - bw) / 2;
          const h = Math.max(b.value > 0 ? 2 : 1, y(0) - y(b.value));
          return (
            <g key={i}>
              <rect className={`chart-bar ${i === shown ? 'on' : ''} ${b.value === 0 ? 'zero' : ''}`} x={x} y={y(0) - h} width={bw} height={h} />
              {i % every === (bars.length - 1) % every && (
                <text className={`chart-axis ${i === shown ? 'on' : ''}`} x={x + bw / 2} y={H - 6} textAnchor="middle">
                  {b.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
