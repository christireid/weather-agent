import { describe, expect, it } from 'vitest';
import { simulateDay, DEFAULT_SEED, mulberry32, hashCombine, createRng } from '../src';

describe('determinism', () => {
  it('same seed → deep-equal MarketDay (minutes)', () => {
    const a = simulateDay(DEFAULT_SEED);
    const b = simulateDay(DEFAULT_SEED);
    expect(a.minutes).toEqual(b.minutes);
  });

  it('same seed → deep-equal sector metadata and shock', () => {
    const a = simulateDay(12345);
    const b = simulateDay(12345);
    expect(a.sectors).toEqual(b.sectors);
    expect(a.shock).toEqual(b.shock);
    expect(a.summary()).toEqual(b.summary());
  });

  it('three consecutive runs are identical', () => {
    const runs = [simulateDay(777), simulateDay(777), simulateDay(777)];
    expect(runs[0]?.minutes).toEqual(runs[1]?.minutes);
    expect(runs[1]?.minutes).toEqual(runs[2]?.minutes);
  });

  it('different seeds produce different days', () => {
    const a = simulateDay(1);
    const b = simulateDay(2);
    expect(a.at(100).index).not.toBe(b.at(100).index);
    expect(a.minutes).not.toEqual(b.minutes);
  });

  it('ticker paths are deterministic', () => {
    const a = simulateDay(42).tickerPath(0, 0);
    const b = simulateDay(42).tickerPath(0, 0);
    expect(a).toEqual(b);
  });

  it('mulberry32 is stable for a known seed', () => {
    const r = mulberry32(1);
    const seq = [r(), r(), r()];
    const r2 = mulberry32(1);
    expect([r2(), r2(), r2()]).toEqual(seq);
    for (const v of seq) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('hashCombine mixes both inputs', () => {
    expect(hashCombine(1, 2)).not.toBe(hashCombine(2, 1));
    expect(hashCombine(1, 2)).not.toBe(hashCombine(1, 3));
    expect(hashCombine(1, 2)).toBe(hashCombine(1, 2));
  });

  it('createRng.normal has roughly zero mean and unit variance', () => {
    const rng = createRng(9);
    const n = 20000;
    let sum = 0;
    let sq = 0;
    for (let i = 0; i < n; i++) {
      const v = rng.normal();
      sum += v;
      sq += v * v;
    }
    expect(Math.abs(sum / n)).toBeLessThan(0.03);
    expect(sq / n).toBeGreaterThan(0.9);
    expect(sq / n).toBeLessThan(1.1);
  });
});
