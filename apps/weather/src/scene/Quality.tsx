/**
 * Adaptive quality controller (spec Part 8). Rolling p75 of real frame time;
 * above 25ms for 2s → step down one tier (particles → DPR → post, in that
 * order); 10 stable seconds → step back up. Disabled when the tier is pinned
 * via ?tier= (reproducible captures/perf runs) — the HUD shows the active
 * tier either way.
 *
 * This is the one place wall-clock deltas are read: it tunes quality, it
 * never drives captured content.
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useWeather } from '../state/store';

const BUDGET_MS = 25; // above the 22ms budget so a passing build never self-degrades
const DEGRADE_AFTER_MS = 2000;
const RECOVER_AFTER_MS = 10000;

/** Quality rungs, best first. */
const RUNGS = [
  { tier: 'high', dprScale: 1, post: true },
  { tier: 'low', dprScale: 1, post: true },
  { tier: 'low', dprScale: 0.75, post: true },
  { tier: 'low', dprScale: 0.75, post: false },
] as const;

export function Quality(): null {
  const samples = useRef<number[]>([]);
  const last = useRef(0);
  const overSince = useRef<number | null>(null);
  const stableSince = useRef<number | null>(null);
  const rung = useRef(0);

  useFrame(() => {
    const s = useWeather.getState();
    if (s.tierPinned || s.captureMode || s.reducedMotion) return;
    const now = performance.now();
    if (last.current > 0) {
      const dt = now - last.current;
      const arr = samples.current;
      arr.push(dt);
      if (arr.length > 90) arr.shift();
      if (arr.length >= 30) {
        const sorted = [...arr].sort((a, b) => a - b);
        const p75 = sorted[Math.floor(sorted.length * 0.75)] ?? 0;
        if (p75 > BUDGET_MS) {
          stableSince.current = null;
          overSince.current ??= now;
          if (now - overSince.current > DEGRADE_AFTER_MS && rung.current < RUNGS.length - 1) {
            rung.current += 1;
            applyRung(rung.current);
            overSince.current = null;
            samples.current = [];
          }
        } else {
          overSince.current = null;
          stableSince.current ??= now;
          if (now - stableSince.current > RECOVER_AFTER_MS && rung.current > 0) {
            rung.current -= 1;
            applyRung(rung.current);
            stableSince.current = null;
            samples.current = [];
          }
        }
      }
    }
    last.current = now;
  });
  return null;
}

function applyRung(i: number): void {
  const r = RUNGS[i];
  if (!r) return;
  const s = useWeather.getState();
  s.setTier(r.tier);
  s.setDprScale(r.dprScale);
  s.setPost(r.post);
}
