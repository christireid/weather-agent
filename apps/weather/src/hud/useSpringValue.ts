/**
 * Minimal spring (stiffness 220, damping 28 — spec §7) for the scrub cursor
 * and panel slide. Interruptible: retargeting mid-flight just changes the
 * attractor. Respects reduced motion by snapping.
 */
import { useEffect, useRef, useState } from 'react';
import { useWeather } from '../state/store';

export function useSpringValue(target: number, opts?: { stiffness?: number; damping?: number }): number {
  const stiffness = opts?.stiffness ?? 220;
  const damping = opts?.damping ?? 28;
  const [value, setValue] = useState(target);
  const state = useRef({ x: target, v: 0 });
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    if (useWeather.getState().reducedMotion) {
      state.current = { x: target, v: 0 };
      setValue(target);
      return;
    }
    let raf = 0;
    let last = performance.now();
    const tick = (now: number): void => {
      const dt = Math.min(1 / 30, (now - last) / 1000);
      last = now;
      const s = state.current;
      const a = stiffness * (targetRef.current - s.x) - damping * s.v;
      s.v += a * dt;
      s.x += s.v * dt;
      if (Math.abs(s.x - targetRef.current) < 1e-4 && Math.abs(s.v) < 1e-3) {
        s.x = targetRef.current;
        s.v = 0;
        setValue(s.x);
        return;
      }
      // Quantize the published value so React re-renders only on visible
      // movement, not every physics tick (frame-loop hygiene).
      setValue(Math.round(s.x * 16) / 16);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, stiffness, damping]);

  return value;
}
