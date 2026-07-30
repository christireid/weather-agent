import { describe, expect, it } from 'vitest';
import { simulateDay } from '../src';

describe('volume', () => {
  const day = simulateDay(20260729);

  it('is U-shaped: open and close deciles exceed midday deciles', () => {
    const totals = day.minutes.map((m) => m.sectors.reduce((a, s) => a + s.volumeRaw, 0));
    const decile = (i: number): number => {
      const from = i * 39;
      const slice = totals.slice(from, from + 39);
      return slice.reduce((a, b) => a + b, 0) / slice.length;
    };
    const open = decile(0);
    const close = decile(9);
    const midday = (decile(4) + decile(5)) / 2;
    expect(open).toBeGreaterThan(midday * 1.3);
    expect(close).toBeGreaterThan(midday * 1.3);
  });

  it('correlates positively with |return|', () => {
    let cov = 0;
    const pairs: [number, number][] = [];
    for (const m of day.minutes) {
      for (const s of m.sectors) pairs.push([Math.abs(s.ret), s.volumeRaw]);
    }
    const mx = pairs.reduce((a, p) => a + p[0], 0) / pairs.length;
    const my = pairs.reduce((a, p) => a + p[1], 0) / pairs.length;
    let vx = 0;
    let vy = 0;
    for (const [x, y] of pairs) {
      cov += (x - mx) * (y - my);
      vx += (x - mx) ** 2;
      vy += (y - my) ** 2;
    }
    const corr = cov / Math.sqrt(vx * vy);
    expect(corr).toBeGreaterThan(0.3);
  });

  it('volume spikes at the shock', () => {
    const shockMin = day.shock?.minute ?? 0;
    const at = (t: number): number =>
      day.at(t).sectors.reduce((a, s) => a + s.volumeRaw, 0);
    const calm = (at(150) + at(160) + at(170)) / 3;
    expect(at(shockMin)).toBeGreaterThan(calm * 1.5);
  });

  it('raw volumes are positive', () => {
    for (const m of day.minutes) {
      for (const s of m.sectors) expect(s.volumeRaw).toBeGreaterThan(0);
    }
  });

  it('summary total volume equals brute-force sum', () => {
    let total = 0;
    for (const m of day.minutes) for (const s of m.sectors) total += s.volumeRaw;
    expect(day.summary().totalVolume).toBeCloseTo(total, 6);
  });
});
