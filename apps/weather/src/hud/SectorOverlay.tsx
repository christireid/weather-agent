/**
 * Keyboard-first sector selection (spec §5): the canvas is never a focus
 * target; eleven invisible-but-focusable region buttons sit over it, each
 * positioned on its Voronoi polygon's bounding box with a hairline focus
 * ring drawn around the region. Arrow keys move between regions in layout
 * order; Enter focuses a sector, Escape releases.
 */
import { useEffect, useMemo, useRef } from 'react';
import { dayFor, useWeather } from '../state/store';
import { buildLayout } from '../scene/layout';
import { hover } from '../state/hover';

export function SectorOverlay(): React.JSX.Element | null {
  const seed = useWeather((s) => s.seed);
  const act = useWeather((s) => s.act);
  const mode = useWeather((s) => s.mode);
  const minute = useWeather((s) => Math.round(s.minute));
  const st = useWeather.getState();
  const day = dayFor(seed);

  // Hover hairline constellation (§2.4): the hovered region's boundary drawn
  // as a hairline, never permanently. Driven imperatively from the shared
  // hover slot so pointer moves stay render-free.
  const hairlineRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = (): void => {
      const svg = hairlineRef.current;
      if (svg) {
        const paths = svg.children;
        for (let i = 0; i < paths.length; i++) {
          (paths[i] as SVGElement).style.opacity = i === hover.sector ? '0.35' : '0';
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const polys = useMemo(() => {
    const layout = buildLayout(seed);
    return layout.polygons.map(
      (poly) =>
        poly.map((p, i) => `${i === 0 ? 'M' : 'L'}${(p.x * 100).toFixed(2)},${((1 - p.y) * 100).toFixed(2)}`).join('') + 'Z',
    );
  }, [seed]);

  const boxes = useMemo(() => {
    const layout = buildLayout(seed);
    return layout.polygons.map((poly) => {
      const xs = poly.map((p) => p.x);
      const ys = poly.map((p) => p.y);
      const x0 = Math.min(...xs);
      const x1 = Math.max(...xs);
      const y0 = Math.min(...ys);
      const y1 = Math.max(...ys);
      // Field y-up → DOM top-down.
      return {
        left: `${(x0 * 100).toFixed(2)}%`,
        top: `${((1 - y1) * 100).toFixed(2)}%`,
        width: `${((x1 - x0) * 100).toFixed(2)}%`,
        height: `${((y1 - y0) * 100).toFixed(2)}%`,
      };
    });
  }, [seed]);

  if (act === 'title' || mode !== 'field') return null;
  const t = Math.round(minute);

  return (
    <nav className="sector-overlay" aria-label="Sky regions">
      <svg
        ref={hairlineRef}
        className="sector-hairlines"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {polys.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#F2EEE4" strokeWidth={0.75} vectorEffect="non-scaling-stroke" style={{ opacity: 0, transition: 'opacity 240ms' }} />
        ))}
      </svg>
      {day.sectors.map((meta, i) => {
        const sec = day.at(t).sectors[i];
        const ret = sec?.returnSinceOpen ?? 0;
        const label = `${meta.name}: ${ret >= 0 ? 'up' : 'down'} ${Math.abs(ret * 100).toFixed(
          2,
        )}% since open, ${
          (sec?.volatility ?? 0) > 0.7 ? 'stormy' : (sec?.volatility ?? 0) > 0.45 ? 'brisk' : 'calm'
        }`;
        return (
          <button
            key={meta.slug}
            className="sector-region"
            style={boxes[i]}
            aria-label={label}
            onFocus={() => {
              hover.sector = i;
            }}
            onBlur={() => {
              hover.sector = -1;
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                (e.currentTarget.parentElement?.children[(i + 1) % 11] as HTMLElement)?.focus();
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                (e.currentTarget.parentElement?.children[(i + 10) % 11] as HTMLElement)?.focus();
              }
            }}
            onClick={() => st.setFocus(st.focus === meta.slug ? null : meta.slug)}
          />
        );
      })}
    </nav>
  );
}
