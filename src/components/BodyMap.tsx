import { useState, type ReactNode } from 'react';
import { MUSCLE_LABEL, type Muscle } from '../muscles';

/**
 * Front and back body diagram, one region per muscle group. Shapes are drawn for the right half
 * of the body (x > 50 in a 100-wide box) and mirrored for the left half.
 * Front, side and rear delts are three separate regions.
 */
type Shapes = Partial<Record<Muscle, string[]>>;

const SILHOUETTE =
  'M50,23 L54,23 L55,27 L67,31 Q79,33 80.5,46 L85.5,76 L90.5,104 L84,107 L77.5,81 L72.5,57 L66.5,60 L65.5,86 L67.5,100 Q70.5,123 66.5,150 L66.5,156 Q67.5,175 63.5,195 L56.5,195 Q53.5,175 55,151 L51,106 L50,106 Z';

const FRONT: Shapes = {
  'upper-back': ['M54.5,25.5 L65.5,31.5 L55,32.5 Z'],
  'front-delts': ['M63.5,33.5 Q69,31.5 71.5,34.5 L71,46.5 Q66,45.5 63,40.5 Z'],
  'side-delts': ['M73.2,34.6 Q78.6,36 79.3,44 L78.6,50 Q74.6,49.6 72.6,47 Z'],
  'upper-chest': ['M51,34 L61.5,34 Q62.5,37.5 61.8,40.6 L51,40.6 Z'],
  chest: ['M51,42.2 L62,42.2 Q64,49.5 59.5,53.6 Q54.5,55.6 51,54 Z'],
  biceps: ['M72.4,50.4 L77.4,50.8 L79.6,72.6 Q77,76.4 75,72.8 Z'],
  brachialis: ['M78.9,51.4 L81.3,52.4 L84.3,72.8 L81.3,74.4 Z'],
  forearms: ['M76.6,79.6 L85,77.4 L89.4,102.8 L84.4,105 Z'],
  abs: ['M51,57 L57.6,57 L57.6,85.6 Q54.6,91.4 51,92.4 Z'],
  obliques: ['M59.2,56.6 L64.4,54.6 L64.6,84 L59.2,87.4 Z'],
  'hip-flexors': ['M57.6,91.6 L65,86.6 L66.4,96.4 L60.4,100 Z'],
  quads: ['M58.6,102.6 L66.6,98.8 Q69.4,121 65.4,148 L56.6,148 Q55.6,125 58.6,102.6 Z'],
  adductors: ['M51.3,101 L56.8,103.4 Q54.4,120 54.9,139 L51.6,129 Z'],
  calves: ['M57,157 L65,157 Q66,173 62.4,191 L58.2,191 Q55.4,173 57,157 Z'],
};

const BACK: Shapes = {
  'upper-back': ['M51,24.6 L54.5,25.5 L65.5,31.5 L60.2,35.6 L57.2,51.6 L51,58.4 Z'],
  'rear-delts': ['M63.5,35.2 Q69,31.5 71.5,34.5 L71,46.5 Q66,45.5 62.6,40.5 Z'],
  'side-delts': ['M73.2,34.6 Q78.6,36 79.3,44 L78.6,50 Q74.6,49.6 72.6,47 Z'],
  lats: ['M58.8,54 L62,41.4 L66.2,47.4 L66,64 Q62.4,78 55.4,84 L51.6,72.4 L51.6,61 Z'],
  'lower-back': ['M51,75.4 L54.6,87 L57.6,94.6 L51,96.6 Z'],
  triceps: ['M72.4,50.4 L81.3,52.4 L84.3,72.8 Q79.4,77.6 75,72.8 Z'],
  forearms: ['M76.6,79.6 L85,77.4 L89.4,102.8 L84.4,105 Z'],
  glutes: ['M51,98.4 L60,96.4 Q67.2,100 66.2,110 Q60.4,117 51,114.4 Z'],
  hamstrings: ['M56.6,118.6 L66.4,113.6 Q68.4,132 65.4,148 L56.6,148 Q55.6,132 56.6,118.6 Z'],
  adductors: ['M51.3,116.4 L55.2,119.4 Q54.4,130 54.9,139 L51.6,131 Z'],
  calves: ['M56.6,155 Q61.4,151 66,155.6 Q67,173 62.4,191 L58.2,191 Q54.6,173 56.6,155 Z'],
};

export type MapLevel = 'primary' | 'secondary' | 'none' | 'light' | 'medium' | 'strong';

interface Props {
  /** Level per muscle; muscles not listed are drawn in the resting colour. */
  levels: Partial<Record<Muscle, MapLevel>>;
  /** Extra text shown after the muscle name when it is tapped, e.g. "12.5 sets". */
  detail?: (m: Muscle) => string;
  /** Text under the map when nothing is selected. */
  caption?: ReactNode;
  compact?: boolean;
}

function Figure({ shapes, levels, selected, onSelect, label }: { shapes: Shapes; levels: Props['levels']; selected: Muscle | null; onSelect: (m: Muscle) => void; label: string }) {
  return (
    <svg viewBox="8 0 84 200" role="group" aria-label={label}>
      <g className="bm-base">
        <ellipse cx="50" cy="13" rx="7.6" ry="9.6" />
        {[false, true].map((mirror) => (
          <g key={String(mirror)} transform={mirror ? 'translate(100,0) scale(-1,1)' : undefined}>
            <path d={SILHOUETTE} />
            <ellipse cx="88.4" cy="110" rx="3.2" ry="5" />
            <ellipse cx="61" cy="197.4" rx="5.4" ry="2.6" />
          </g>
        ))}
      </g>
      {(Object.keys(shapes) as Muscle[]).map((mu) => {
        const level = levels[mu] ?? 'rest';
        return (
          <g
            key={mu}
            className={`bm-muscle bm-${level} ${selected === mu ? 'bm-selected' : ''}`}
            role="button"
            tabIndex={0}
            aria-label={MUSCLE_LABEL[mu]}
            aria-pressed={selected === mu}
            onClick={() => onSelect(mu)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(mu)}
          >
            {[false, true].map((mirror) =>
              shapes[mu]!.map((d, i) => <path key={`${mirror}-${i}`} d={d} transform={mirror ? 'translate(100,0) scale(-1,1)' : undefined} />),
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function BodyMap({ levels, detail, caption, compact }: Props) {
  const [selected, setSelected] = useState<Muscle | null>(null);
  const toggle = (m: Muscle) => setSelected(selected === m ? null : m);
  return (
    <div className={`bodymap ${compact ? 'bodymap-compact' : ''}`}>
      <div className="bodymap-figures">
        <figure>
          <Figure shapes={FRONT} levels={levels} selected={selected} onSelect={toggle} label="Front of body" />
          <figcaption>Front</figcaption>
        </figure>
        <figure>
          <Figure shapes={BACK} levels={levels} selected={selected} onSelect={toggle} label="Back of body" />
          <figcaption>Back</figcaption>
        </figure>
      </div>
      <p className="bodymap-readout" aria-live="polite">
        {selected ? (
          <>
            <strong>{MUSCLE_LABEL[selected]}</strong>
            {detail ? ` · ${detail(selected)}` : ''}
          </>
        ) : (
          (caption ?? <span className="muted">Tap a muscle to see its name</span>)
        )}
      </p>
    </div>
  );
}
