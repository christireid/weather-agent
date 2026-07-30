/**
 * Boring Mode (spec §3.3) — the judgment statement. A DOM/SVG heatmap of the
 * same data through the same selectors: 11 sector rows × 78 five-minute
 * buckets colored by the shared temperature ramp, the index line above, the
 * same time cursor, the same focus interaction. Doubles as the accessibility
 * surface and the no-WebGL fallback.
 *
 * Cell text contrast follows §6.2: the cursor chip picks sky-dark or paper
 * text per cell by computed luminance, never by eye.
 */
import { useMemo, useRef } from 'react';
import { clockLabel, MINUTES } from '@market-weather/market';
import { dayFor, useWeather } from '../state/store';
import { contrastRatio, rampCss, rampLuminance, returnToT } from '../scene/ramp';

const BUCKETS = 78; // 390 minutes / 5

/** §6.2 luminance switch: sky-dark text on warm/neutral cells, paper on deep cool. */
export function cellTextColor(t: number): string {
  const cellL = rampLuminance(t);
  const skyDarkL = 0.0035; // #0B0C14
  return contrastRatio(cellL, skyDarkL) >= 4.5 ? '#0B0C14' : '#F2EEE4';
}

export function Boring(): React.JSX.Element {
  const seed = useWeather((s) => s.seed);
  const minute = useWeather((s) => s.minute);
  const st = useWeather.getState();
  const day = dayFor(seed);
  const gridRef = useRef<HTMLDivElement>(null);

  const cells = useMemo(() => {
    return day.sectors.map((_, s) =>
      Array.from({ length: BUCKETS }, (_, b) => {
        const endMinute = Math.min(MINUTES - 1, b * 5 + 4);
        const sec = day.at(endMinute).sectors[s];
        const ret = sec?.returnSinceOpen ?? 0;
        const vol = sec?.volatility ?? 0;
        return { ret, vol, t: returnToT(ret), endMinute };
      }),
    );
  }, [day]);

  const indexD = useMemo(() => {
    const path = day.indexPath();
    const lo = Math.min(...path);
    const hi = Math.max(...path);
    const span = Math.max(1e-6, hi - lo);
    let d = '';
    for (let t = 0; t < MINUTES; t += 2) {
      const x = (t / (MINUTES - 1)) * 1000;
      const y = 4 + (1 - ((path[t] ?? 0) - lo) / span) * 54;
      d += `${t === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }
    return d;
  }, [day]);

  const cursorBucket = Math.min(BUCKETS - 1, Math.floor(minute / 5));
  const t = Math.round(minute);
  const pct = (x: number): string => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(2)}%`;

  const moveFocus = (row: number, col: number): void => {
    const el = gridRef.current?.querySelector<HTMLButtonElement>(
      `[data-cell="${row}-${col}"]`,
    );
    el?.focus();
  };

  const onGridKey = (e: React.KeyboardEvent, row: number, col: number): void => {
    let r = row;
    let c = col;
    if (e.key === 'ArrowRight') c++;
    else if (e.key === 'ArrowLeft') c--;
    else if (e.key === 'ArrowDown') r++;
    else if (e.key === 'ArrowUp') r--;
    else if (e.key === 'Home') c = 0;
    else if (e.key === 'End') c = BUCKETS - 1;
    else return;
    e.preventDefault();
    moveFocus(Math.max(0, Math.min(10, r)), Math.max(0, Math.min(BUCKETS - 1, c)));
  };

  return (
    <section className="boring" aria-label="Boring Mode: sector heatmap of the simulated day">
      <header className="boring-head">
        <div>
          <h2>The same day, boring</h2>
          <p>11 sectors × 5-minute buckets · color is return since open · same data, same cursor</p>
        </div>
        <div className="boring-figures">
          <span>{clockLabel(t)}</span>
          <span style={{ color: rampCss(returnToT(day.at(t).index)) }}>
            index {pct(day.at(t).index)}
          </span>
          <span className="boring-barlegend">bars: volatility / volume</span>
        </div>
      </header>

      <div className="boring-index">
        <svg viewBox="0 0 1000 62" preserveAspectRatio="none" aria-hidden="true">
          <path d={indexD} fill="none" stroke="#F2EEE4" strokeWidth={1.5} opacity={0.8} vectorEffect="non-scaling-stroke" />
          <line
            x1={(minute / (MINUTES - 1)) * 1000}
            x2={(minute / (MINUTES - 1)) * 1000}
            y1={0}
            y2={62}
            stroke="#F2EEE4"
            strokeWidth={1}
            opacity={0.85}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      <div className="boring-grid" role="grid" aria-label="Sector returns heatmap" ref={gridRef}>
        {day.sectors.map((meta, s) => {
          const cur = day.at(t).sectors[s];
          const rowCells = cells[s] ?? [];
          return (
            <div role="row" className="boring-row" key={meta.slug}>
              <button
                className="boring-rowlabel"
                onClick={() => st.setFocus(meta.slug)}
                aria-label={`Open ${meta.name} sector panel`}
              >
                {meta.name}
              </button>
              <div className="boring-cells">
                {rowCells.map((cell, b) => {
                  const isCursor = b === cursorBucket;
                  const label = `${meta.name}, ${clockLabel(cell.endMinute)}, ${
                    cell.ret >= 0 ? 'up' : 'down'
                  } ${Math.abs(cell.ret * 100).toFixed(2)}%, volatility ${
                    cell.vol > 0.7 ? 'high' : cell.vol > 0.45 ? 'elevated' : 'low'
                  }`;
                  return (
                    <button
                      key={b}
                      role="gridcell"
                      data-cell={`${s}-${b}`}
                      tabIndex={s === 0 && b === 0 ? 0 : -1}
                      className={`boring-cell${isCursor ? ' is-cursor' : ''}`}
                      style={{ background: rampCss(cell.t) }}
                      aria-label={label}
                      title={label}
                      onKeyDown={(e) => onGridKey(e, s, b)}
                      onClick={() => {
                        st.setMinute(Math.min(389, b * 5 + 2), { scrub: true });
                        st.setFocus(meta.slug);
                      }}
                    />
                  );
                })}
              </div>
              {/* Precise figure in tabular numerals, set ON the cursor cell's
                  color with the §6.2 per-cell luminance switch — plus the two
                  remaining field channels (volatility, volume) as micro-bars,
                  so information parity with the sky holds (spec §5.4). */}
              <span
                className="boring-rowfigure"
                style={{
                  background: rampCss(rowCells[cursorBucket]?.t ?? 0.5),
                  color: cellTextColor(rowCells[cursorBucket]?.t ?? 0.5),
                }}
              >
                {pct(cur?.returnSinceOpen ?? 0)}
              </span>
              <span
                className="boring-microbars"
                title={`volatility ${((cur?.volatility ?? 0) * 100).toFixed(0)} · volume ${((cur?.volume ?? 0) * 100).toFixed(0)}`}
              >
                <span className="microbar" style={{ width: `${((cur?.volatility ?? 0) * 100).toFixed(0)}%` }} />
                <span className="microbar" style={{ width: `${((cur?.volume ?? 0) * 100).toFixed(0)}%` }} />
              </span>
            </div>
          );
        })}
      </div>

    </section>
  );
}
