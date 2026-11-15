const W = 72;
const H = 26;
const PAD = 3;

/** Tiny trend line of the last few sessions. Renders nothing until there are two points. */
export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = PAD + (i / (values.length - 1)) * (W - PAD * 2);
    const y = max === min ? H / 2 : H - PAD - ((v - min) / span) * (H - PAD * 2);
    return [x, y] as const;
  });
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <polyline points={pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} />
      <circle cx={lx} cy={ly} r="2.4" />
    </svg>
  );
}
