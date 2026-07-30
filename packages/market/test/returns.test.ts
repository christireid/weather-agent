import { describe, expect, it } from 'vitest';
import { simulateDay } from '../src';

describe('returns and index', () => {
  const day = simulateDay(20260729);

  it('index matches brute-force equal-weighted sector composite at every minute', () => {
    for (const m of day.minutes) {
      const brute = m.sectors.reduce((a, s) => a + s.returnSinceOpen, 0) / m.sectors.length;
      expect(m.index).toBeCloseTo(brute, 12);
    }
  });

  it('since-open returns compound correctly from per-minute returns', () => {
    for (let s = 0; s < 11; s++) {
      let acc = 1;
      for (let t = 0; t < 390; t++) {
        const sec = day.at(t).sectors[s];
        if (!sec) throw new Error('missing sector');
        acc *= 1 + sec.ret;
        expect(sec.returnSinceOpen).toBeCloseTo(acc - 1, 10);
      }
    }
  });

  it('indexPath has 390 entries and matches minute state', () => {
    const path = day.indexPath();
    expect(path).toHaveLength(390);
    expect(path[290]).toBe(day.at(290).index);
  });

  it('index per-minute return is consistent with the index path', () => {
    for (let t = 1; t < 390; t++) {
      const expected = (1 + day.at(t).index) / (1 + day.at(t - 1).index) - 1;
      expect(day.at(t).indexReturn).toBeCloseTo(expected, 12);
    }
  });

  it('sector betas differentiate sensitivity to the market factor', () => {
    // Correlation between per-minute sector returns and index returns should be
    // positive for all sectors (one-factor structure).
    for (let s = 0; s < 11; s++) {
      const xs: number[] = [];
      const ys: number[] = [];
      for (let t = 1; t < 390; t++) {
        xs.push(day.at(t).indexReturn);
        ys.push(day.at(t).sectors[s]?.ret ?? 0);
      }
      expect(corr(xs, ys)).toBeGreaterThan(0.15);
    }
  });

  function corr(xs: number[], ys: number[]): number {
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let cov = 0;
    let vx = 0;
    let vy = 0;
    for (let i = 0; i < n; i++) {
      const dx = (xs[i] ?? 0) - mx;
      const dy = (ys[i] ?? 0) - my;
      cov += dx * dy;
      vx += dx * dx;
      vy += dy * dy;
    }
    return cov / Math.sqrt(vx * vy);
  }
});
