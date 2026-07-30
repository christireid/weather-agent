/**
 * The legend (spec §2.3): six-word entries that teach the metaphor contract.
 * Collapsed to a single hairline chip by default; expands on demand. The
 * legend confirms, it never decorates — instrument labels, not marketing.
 */
import { useState } from 'react';
import { useWeather } from '../state/store';

const ENTRIES: [string, string][] = [
  ['wind', 'flow direction is sector momentum'],
  ['turbulence', 'eddies and gusts are volatility'],
  ['density', 'particle density is trading volume'],
  ['color', 'amber gains, blue-violet losses'],
  ['pulses', 'brief glints are volume spikes'],
];

export function Legend(): React.JSX.Element | null {
  const act = useWeather((s) => s.act);
  const mode = useWeather((s) => s.mode);
  const [open, setOpen] = useState(false);
  if (act === 'title' || mode !== 'field') return null;
  return (
    <div className="legend hud-el">
      <button
        className="legend-toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        legend {open ? '−' : '+'}
      </button>
      {open ? (
        <dl className="legend-list">
          {ENTRIES.map(([term, def]) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{def}</dd>
            </div>
          ))}
          <p className="legend-note">every channel is one data channel</p>
        </dl>
      ) : null}
    </div>
  );
}
