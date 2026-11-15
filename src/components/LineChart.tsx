import { useState } from 'react';

export interface Point {
  t: number;
  y: number;
  /** Text for the tooltip/readout, e.g. "42 kg × 12". */
  label: string;
}

interface Props {
  title: string;
  unit: string;
  points: Point[];
}

const W = 340;
const H = 150;
const PAD = { l: 34, r: 14, t: 12, b: 22 };

export function niceTicks(min: number, max: number): number[] {
  if (min === max) return [min];
  const span = max - min;
  const raw = span / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= 4) ?? 10 * mag;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

/** Single-series line chart. Tap anywhere to read the nearest session. */
export function LineChart({ title, unit, points }: Props) {
  const [sel, setSel] = useState<number | null>(null);
  if (points.length === 0) return null;

  const ys = points.map((p) => p.y);
  let yMin = Math.min(...ys);
  let yMax = Math.max(...ys);
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const pad = (yMax - yMin) * 0.1;
  yMin = Math.max(0, yMin - pad);
  yMax += pad;
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const x = (t: number) => (t1 === t0 ? (PAD.l + W - PAD.r) / 2 : PAD.l + ((t - t0) / (t1 - t0)) * (W - PAD.l - PAD.r));
  const y = (v: number) => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);
  const ticks = niceTicks(yMin, yMax);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
  const shown = sel ?? points.length - 1;
  const sp = points[shown];

  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(points[i].t) - px) < Math.abs(x(points[best].t) - px)) best = i;
    setSel(best);
  };

  return (
    <figure className="chart">
      <figcaption>
        <span className="chart-title">{title}</span>
        <span className="chart-readout">
          {new Date(sp.t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · <strong>{sp.label}</strong>
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}, ${points.length} sessions`} onPointerDown={pick} onPointerMove={(e) => e.buttons && pick(e)}>
        {ticks.map((v) => (
          <g key={v}>
            <line className="chart-grid" x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} />
            <text className="chart-axis" x={PAD.l - 6} y={y(v)} dy="0.32em" textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        <text className="chart-axis" x={W - PAD.r} y={H - 6} textAnchor="end">
          {unit}
        </text>
        <line className="chart-cross" x1={x(sp.t)} x2={x(sp.t)} y1={PAD.t} y2={H - PAD.b} />
        <path className="chart-line" d={path} />
        {points.map((p, i) => (
          <circle key={i} className={`chart-dot ${i === shown ? 'on' : ''}`} cx={x(p.t)} cy={y(p.y)} r={i === shown ? 5 : 4} />
        ))}
      </svg>
    </figure>
  );
}
