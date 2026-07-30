/**
 * Act III instrument panel: sector name, simulated return / volatility /
 * volume, and five constituent sparklines. Slides in on the panel spring
 * (stiffness 220, damping 28); Escape or click-out releases.
 */
import { useMemo } from 'react';
import { MINUTES } from '@market-weather/market';
import { dayFor, useWeather } from '../state/store';
import { rampCss, returnToT } from '../scene/ramp';
import { useSpringValue } from './useSpringValue';

const SPARK_W = 132;
const SPARK_H = 28;

function sparkPath(path: number[], upTo: number): string {
  let d = '';
  const lo = Math.min(...path);
  const hi = Math.max(...path);
  const span = Math.max(1e-6, hi - lo);
  const end = Math.max(2, Math.min(MINUTES - 1, upTo));
  for (let t = 0; t <= end; t += 4) {
    const x = (t / (MINUTES - 1)) * SPARK_W;
    const y = 3 + (1 - ((path[t] ?? 0) - lo) / span) * (SPARK_H - 6);
    d += `${t === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }
  return d;
}

export function FocusPanel(): React.JSX.Element | null {
  const seed = useWeather((s) => s.seed);
  const focus = useWeather((s) => s.focus);
  const minute = useWeather((s) => s.minute);
  const setFocus = useWeather((s) => s.setFocus);
  const day = dayFor(seed);
  const idx = focus ? day.sectors.findIndex((x) => x.slug === focus) : -1;

  const open = idx >= 0;
  const slide = useSpringValue(open ? 0 : 1);
  const t = Math.round(minute);

  const paths = useMemo(() => {
    if (idx < 0) return [];
    return Array.from({ length: 5 }, (_, k) => day.tickerPath(idx, k));
  }, [day, idx]);

  if (!open && slide > 0.995) return null;
  const meta = day.sectors[idx];
  const sec = day.at(t).sectors[idx];
  if (!meta || !sec) return null;

  const pct = (x: number): string => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(2)}%`;
  const volWord = sec.volatility > 0.7 ? 'stormy' : sec.volatility > 0.45 ? 'brisk' : 'calm';

  return (
    <aside
      className="focus-panel"
      style={{ transform: `translateX(${(slide * 108).toFixed(2)}%)` }}
      aria-label={`${meta.name} sector detail`}
    >
      <header>
        <h2>{meta.name}</h2>
        <button className="panel-close" onClick={() => setFocus(null)} aria-label="Close sector panel">
          ✕
        </button>
      </header>
      <dl className="panel-figures">
        <div>
          <dt>return since open</dt>
          <dd style={{ color: rampCss(returnToT(sec.returnSinceOpen)) }}>{pct(sec.returnSinceOpen)}</dd>
        </div>
        <div>
          <dt>volatility</dt>
          <dd>
            {volWord} · {(sec.volatility * 100).toFixed(0)}
          </dd>
        </div>
        <div>
          <dt>volume / min</dt>
          <dd>{sec.volumeRaw.toFixed(1)}M</dd>
        </div>
      </dl>
      <ul className="panel-tickers">
        {meta.tickers.map((tk, k) => {
          const path = paths[k] ?? [];
          const cur = path[t] ?? 0;
          return (
            <li key={tk.symbol}>
              <span className="tk-sym">{tk.symbol}</span>
              <span className="tk-name">{tk.name}</span>
              <svg width={SPARK_W} height={SPARK_H} aria-hidden="true" className="spark">
                <path d={sparkPath(path, t)} fill="none" strokeWidth={1.25} stroke={rampCss(returnToT(cur))} />
              </svg>
              <span className="tk-ret" style={{ color: rampCss(returnToT(cur)) }}>
                {pct(cur)}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="panel-note">simulated constituents</p>
    </aside>
  );
}
