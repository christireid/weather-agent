import { describe, expect, it } from 'vitest';
import { simulateDay } from '../src';

describe('normalization (renderer-facing channels)', () => {
  const seeds = [20260729, 7, 99];

  it('volatility ∈ [0,1] for every sector-minute', () => {
    for (const seed of seeds) {
      const day = simulateDay(seed);
      for (const m of day.minutes) {
        for (const s of m.sectors) {
          expect(s.volatility).toBeGreaterThanOrEqual(0);
          expect(s.volatility).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('volume ∈ [0,1] for every sector-minute', () => {
    for (const seed of seeds) {
      const day = simulateDay(seed);
      for (const m of day.minutes) {
        for (const s of m.sectors) {
          expect(s.volume).toBeGreaterThanOrEqual(0);
          expect(s.volume).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('momentum ∈ [-1,1] for every sector-minute', () => {
    for (const seed of seeds) {
      const day = simulateDay(seed);
      for (const m of day.minutes) {
        for (const s of m.sectors) {
          expect(s.momentum).toBeGreaterThanOrEqual(-1);
          expect(s.momentum).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('marketVol ∈ [0,1] and reaches 1 at its peak', () => {
    for (const seed of seeds) {
      const day = simulateDay(seed);
      const vols = day.minutes.map((m) => m.marketVol);
      expect(Math.min(...vols)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...vols)).toBeCloseTo(1, 10);
    }
  });

  it('normalization denominators are shared globally (calm sectors stay calm in a storm)', () => {
    const day = simulateDay(20260729);
    const peak = day.summary().volPeakMinute;
    const vols = day.at(peak).sectors.map((s) => s.volatility);
    // With a shared denominator, low-shock-weight sectors sit well below the max.
    expect(Math.min(...vols)).toBeLessThan(0.6);
  });

  it('volume normalization reaches 1 at the day max', () => {
    const day = simulateDay(20260729);
    let max = 0;
    for (const m of day.minutes) for (const s of m.sectors) max = Math.max(max, s.volume);
    expect(max).toBeCloseTo(1, 10);
  });
});
