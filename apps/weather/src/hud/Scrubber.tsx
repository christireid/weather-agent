/**
 * The time scrubber (spec §3.2): full-width 9:30–16:00 timeline with the
 * realized index path (1.5px) and a volatility heat strip. Dragging follows
 * the pointer exactly; the cursor springs on release/keyboard steps. Arrow
 * keys step 5 simulated minutes, shift+arrows 30, Home/End jump.
 */
import { useMemo, useRef, useState } from 'react';
import { clockLabel, MINUTES } from '@market-weather/market';
import { dayFor, syncUrl, useWeather } from '../state/store';
import { useSpringValue } from './useSpringValue';

const W = 1000; // viewBox units
const H = 56;
const PATH_H = 36;
const HEAT_H = 8;

export function Scrubber(): React.JSX.Element {
  const seed = useWeather((s) => s.seed);
  const minute = useWeather((s) => s.minute);
  const setMinute = useWeather((s) => s.setMinute);
  const day = dayFor(seed);
  const [dragging, setDragging] = useState(false);
  const ref = useRef<SVGSVGElement>(null);

  const { indexD, heatRects, lo, hi } = useMemo(() => {
    const path = day.indexPath();
    const vols = day.volPath();
    const lo = Math.min(...path);
    const hi = Math.max(...path);
    const span = Math.max(1e-6, hi - lo);
    let d = '';
    for (let t = 0; t < MINUTES; t += 2) {
      const x = (t / (MINUTES - 1)) * W;
      const y = 6 + (1 - ((path[t] ?? 0) - lo) / span) * (PATH_H - 12);
      d += `${t === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }
    const rects = Array.from({ length: 78 }, (_, i) => {
      const t0 = i * 5;
      let v = 0;
      for (let t = t0; t < t0 + 5 && t < MINUTES; t++) v = Math.max(v, vols[t] ?? 0);
      return { x: (t0 / (MINUTES - 1)) * W, o: 0.06 + 0.66 * v };
    });
    return { indexD: d, heatRects: rects, lo, hi };
  }, [day]);

  const springMinute = useSpringValue(minute);
  const shownMinute = dragging ? minute : springMinute;
  const cx = (shownMinute / (MINUTES - 1)) * W;

  const minuteFromEvent = (e: { clientX: number }): number => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return minute;
    const f = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    return Math.round(f * (MINUTES - 1));
  };

  const onKey = (e: React.KeyboardEvent): void => {
    let next: number | null = null;
    const step = e.shiftKey ? 30 : 5;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = minute + step;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = minute - step;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = MINUTES - 1;
    if (next !== null) {
      e.preventDefault();
      setMinute(Math.round(next), { scrub: true });
      syncUrl();
    }
  };

  return (
    <div className="scrubber hud-el">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="slider"
        aria-label="Simulated trading day timeline, 9:30 AM to 4:00 PM"
        aria-valuemin={0}
        aria-valuemax={MINUTES - 1}
        aria-valuenow={Math.round(minute)}
        aria-valuetext={clockLabel(Math.round(minute))}
        tabIndex={0}
        onKeyDown={onKey}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          setDragging(true);
          setMinute(minuteFromEvent(e), { scrub: true });
        }}
        onPointerMove={(e) => {
          if (dragging) setMinute(minuteFromEvent(e), { scrub: true });
        }}
        onPointerUp={() => {
          setDragging(false);
          syncUrl();
        }}
        onPointerCancel={() => setDragging(false)}
      >
        {/* volatility heat strip (channel: market vol) */}
        {heatRects.map((r, i) => (
          <rect
            key={i}
            x={r.x}
            y={PATH_H + 6}
            width={W / 78 + 0.5}
            height={HEAT_H}
            fill="#F2EEE4"
            opacity={r.o}
          />
        ))}
        {/* realized index path */}
        <path d={indexD} fill="none" stroke="#F2EEE4" strokeWidth={1.5} opacity={0.75} vectorEffect="non-scaling-stroke" />
        {/* zero line */}
        <line
          x1={0}
          x2={W}
          y1={6 + (1 - (0 - lo) / Math.max(1e-6, hi - lo)) * (PATH_H - 12)}
          y2={6 + (1 - (0 - lo) / Math.max(1e-6, hi - lo)) * (PATH_H - 12)}
          stroke="#F2EEE4"
          opacity={0.14}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        {/* cursor */}
        <line x1={cx} x2={cx} y1={0} y2={H} stroke="#F2EEE4" strokeWidth={1.5} opacity={0.95} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="scrubber-times" aria-hidden="true">
        <span>9:30</span>
        <span>12:45</span>
        <span>16:00</span>
      </div>
    </div>
  );
}
