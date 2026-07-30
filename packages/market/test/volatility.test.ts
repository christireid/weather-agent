import { describe, expect, it } from 'vitest';
import { simulateDay } from '../src';

describe('volatility clustering', () => {
  it('autocorrelation of squared index returns is positive', () => {
    // Average over several seeds so one lucky path can't pass/fail alone.
    const seeds = [11, 22, 33, 44, 55];
    let acSum = 0;
    for (const seed of seeds) {
      const day = simulateDay(seed);
      const sq = day.minutes.map((m) => m.indexReturn * m.indexReturn);
      acSum += autocorr(sq, 1);
    }
    expect(acSum / seeds.length).toBeGreaterThan(0.02);
  });

  it('post-shock vol decays on a 20-minute windowed-average envelope', () => {
    // Asserted on windowed averages, never raw minutes (raw conditional vol is
    // legitimately non-monotonic because b·shock² is stochastic every minute).
    const day = simulateDay(20260729);
    const shock = day.shock;
    expect(shock).not.toBeNull();
    if (!shock) return;
    const start = shock.minute + 6; // after the impulse window
    const avgWindow = (from: number): number => {
      let sum = 0;
      for (let t = from; t < from + 20; t++) sum += maxSectorVol(day, t);
      return sum / 20;
    };
    const w1 = avgWindow(start);
    const w2 = avgWindow(start + 20);
    const w3 = avgWindow(start + 40);
    expect(w2).toBeLessThan(w1);
    expect(w3).toBeLessThan(w2);
  });

  it('shock raises vol well above the morning baseline', () => {
    const day = simulateDay(20260729);
    const morning = avgRange(day, 30, 120);
    const stormPeak = maxRange(day, 285, 310);
    expect(stormPeak).toBeGreaterThan(morning * 2.5);
  });

  it('a no-shock day keeps normalized vol structure sane (no flat zero)', () => {
    // Find a no-shock seed deterministically.
    let seed = 0;
    for (let s = 1; s < 200; s++) {
      if (simulateDay(s).shock === null) {
        seed = s;
        break;
      }
    }
    expect(seed).toBeGreaterThan(0);
    const day = simulateDay(seed);
    const vols = day.minutes.flatMap((m) => m.sectors.map((x) => x.volatility));
    expect(Math.max(...vols)).toBe(1); // day-max normalization reaches 1
    expect(Math.min(...vols)).toBeGreaterThanOrEqual(0);
  });

  function maxSectorVol(day: ReturnType<typeof simulateDay>, t: number): number {
    return Math.max(...day.at(t).sectors.map((s) => s.volatility));
  }
  function avgRange(day: ReturnType<typeof simulateDay>, a: number, b: number): number {
    let sum = 0;
    for (let t = a; t < b; t++) sum += maxSectorVol(day, t);
    return sum / (b - a);
  }
  function maxRange(day: ReturnType<typeof simulateDay>, a: number, b: number): number {
    let max = 0;
    for (let t = a; t < b; t++) max = Math.max(max, maxSectorVol(day, t));
    return max;
  }

  function autocorr(xs: number[], lag: number): number {
    const n = xs.length;
    const mean = xs.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      const d = (xs[i] ?? 0) - mean;
      den += d * d;
      if (i + lag < n) num += d * ((xs[i + lag] ?? 0) - mean);
    }
    return den === 0 ? 0 : num / den;
  }
});
