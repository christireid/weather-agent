/**
 * The time scrubber (spec §3.2): full-width 9:30–16:00 timeline with the
 * realized index path (1.5px) and a volatility heat strip. Dragging follows
 * the pointer exactly; the cursor springs on release/keyboard steps. Arrow
 * keys step 5 simulated minutes, shift+arrows 30, Home/End jump.
 *
 * Frame-loop hygiene: the timeline artwork renders once per day (memo) and
 * the cursor line is driven imperatively by its own spring — free playback
 * causes zero React re-renders here beyond the 1/min aria update.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { clockLabel, MINUTES, type MarketDay } from '@market-weather/market';
import { dayFor, syncUrl, useWeather } from '../state/store';

const W = 1000; // viewBox units
const H = 56;
const PATH_H = 36;
const HEAT_H = 8;

const Timeline = memo(function Timeline({ day }: { day: MarketDay }): React.JSX.Element {
  const { indexD, heatRects, zeroY } = useMemo(() => {
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
    const zeroY = 6 + (1 - (0 - lo) / span) * (PATH_H - 12);
    return { indexD: d, heatRects: rects, zeroY };
  }, [day]);

  return (
    <>
      {/* volatility heat strip (channel: market vol) */}
      {heatRects.map((r, i) => (
        <rect key={i} x={r.x} y={PATH_H + 6} width={W / 78 + 0.5} height={HEAT_H} fill="#F2EEE4" opacity={r.o} />
      ))}
      <path d={indexD} fill="none" stroke="#F2EEE4" strokeWidth={1.5} opacity={0.75} vectorEffect="non-scaling-stroke" />
      <line x1={0} x2={W} y1={zeroY} y2={zeroY} stroke="#F2EEE4" opacity={0.14} strokeWidth={1} vectorEffect="non-scaling-stroke" />
    </>
  );
});

export function Scrubber(): React.JSX.Element {
  const seed = useWeather((s) => s.seed);
  const ariaMinute = useWeather((s) => Math.round(s.minute));
  const setMinute = useWeather((s) => s.setMinute);
  const day = dayFor(seed);
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  draggingRef.current = dragging;
  const ref = useRef<SVGSVGElement>(null);
  const cursorRef = useRef<SVGLineElement>(null);

  // Imperative spring cursor (stiffness 220, damping 28): follows exactly
  // while dragging, springs on release/keys, zero React churn.
  useEffect(() => {
    let raf = 0;
    let x = useWeather.getState().minute;
    let v = 0;
    let last = performance.now();
    const tick = (now: number): void => {
      const dt = Math.min(1 / 30, (now - last) / 1000);
      last = now;
      const s = useWeather.getState();
      const target = s.minute;
      if (draggingRef.current || s.reducedMotion) {
        x = target;
        v = 0;
      } else {
        const a = 220 * (target - x) - 28 * v;
        v += a * dt;
        x += v * dt;
      }
      const cx = (x / (MINUTES - 1)) * W;
      cursorRef.current?.setAttribute('x1', String(cx));
      cursorRef.current?.setAttribute('x2', String(cx));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const minuteFromEvent = (e: { clientX: number }): number => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return useWeather.getState().minute;
    const f = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    return Math.round(f * (MINUTES - 1));
  };

  const onKey = (e: React.KeyboardEvent): void => {
    let next: number | null = null;
    const step = e.shiftKey ? 30 : 5;
    const minute = useWeather.getState().minute;
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
        aria-valuenow={ariaMinute}
        aria-valuetext={clockLabel(ariaMinute)}
        tabIndex={0}
        onKeyDown={onKey}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          setDragging(true);
          setMinute(minuteFromEvent(e), { scrub: true });
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) setMinute(minuteFromEvent(e), { scrub: true });
        }}
        onPointerUp={() => {
          setDragging(false);
          syncUrl();
        }}
        onPointerCancel={() => setDragging(false)}
      >
        <Timeline day={day} />
        <line ref={cursorRef} x1={0} x2={0} y1={0} y2={H} stroke="#F2EEE4" strokeWidth={1.5} opacity={0.95} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="scrubber-times" aria-hidden="true">
        <span>9:30</span>
        <span>12:45</span>
        <span>16:00</span>
      </div>
    </div>
  );
}
