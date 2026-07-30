/**
 * The injected virtual clock (spec §1.6). One market day ≈ 90 real seconds
 * unattended → 390/90 simulated minutes per real second. Shader time uniforms
 * derive from this clock, never from wall time, so captures are reproducible.
 *
 * In capture mode the clock only advances via window.__mw.step(ms); in normal
 * mode it advances from requestAnimationFrame deltas (the render clock).
 */
import { useWeather } from './store';

export const MINUTES_PER_SECOND = 390 / 90;

let virtualMs = 0;
let lastRafTs: number | null = null;

/** Total virtual milliseconds since page start (drives shader time uniforms). */
export function virtualNow(): number {
  return virtualMs;
}

/** Advance from an rAF timestamp (no-op in capture mode; step() drives instead). */
export function tickFromRaf(rafTs: number): number {
  const s = useWeather.getState();
  if (s.captureMode) {
    lastRafTs = rafTs;
    return 0;
  }
  const dt = lastRafTs === null ? 0 : Math.min(100, rafTs - lastRafTs);
  lastRafTs = rafTs;
  virtualMs += dt;
  if (!s.paused && s.act !== 'title' && s.mode === 'field') {
    const advance = (dt / 1000) * MINUTES_PER_SECOND;
    const next = s.minute + advance;
    if (next >= 389) {
      if (s.minute < 389) s.setMinute(389);
      if (s.act === 'field' && s.focus === null) s.setAct('review');
    } else {
      s.setMinute(next);
    }
  }
  return dt;
}

/** Deterministic step for the capture harness. */
export function stepVirtual(ms: number): void {
  virtualMs += ms;
  const s = useWeather.getState();
  if (!s.paused && s.act !== 'title' && s.mode === 'field') {
    s.setMinute(Math.min(389, s.minute + (ms / 1000) * MINUTES_PER_SECOND));
  }
}
