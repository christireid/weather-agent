import { describe, expect, it } from 'vitest';
import { simulateDay, MINUTES, SECTOR_COUNT, TICKERS_PER_SECTOR, clockLabel } from '../src';

const day = simulateDay(20260729);

describe('shape', () => {
  it('has 390 minutes', () => {
    expect(day.minutes).toHaveLength(390);
    expect(MINUTES).toBe(390);
  });

  it('has 11 sectors with metadata', () => {
    expect(day.sectors).toHaveLength(11);
    expect(SECTOR_COUNT).toBe(11);
    for (const s of day.sectors) {
      expect(s.name.length).toBeGreaterThan(2);
      expect(s.slug).toMatch(/^[a-z0-9-]+$/);
      expect(s.beta).toBeGreaterThanOrEqual(0.6);
      expect(s.beta).toBeLessThanOrEqual(1.4);
    }
  });

  it('has 55 tickers with fictional names', () => {
    const all = day.sectors.flatMap((s) => s.tickers);
    expect(all).toHaveLength(55);
    expect(TICKERS_PER_SECTOR).toBe(5);
    const symbols = new Set(all.map((t) => t.symbol));
    expect(symbols.size).toBe(55);
  });

  it('every minute has 11 sector entries', () => {
    for (const m of day.minutes) expect(m.sectors).toHaveLength(11);
  });

  it('no NaN or Infinity anywhere in renderer-facing state', () => {
    for (const m of day.minutes) {
      expect(Number.isFinite(m.index)).toBe(true);
      expect(Number.isFinite(m.indexReturn)).toBe(true);
      expect(Number.isFinite(m.marketVol)).toBe(true);
      for (const s of m.sectors) {
        for (const v of [s.ret, s.returnSinceOpen, s.momentum, s.volatility, s.volume, s.volumeRaw]) {
          expect(Number.isFinite(v)).toBe(true);
        }
      }
    }
  });

  it('ticker paths exist for all 55 tickers with no NaN', () => {
    for (let s = 0; s < 11; s++) {
      for (let k = 0; k < 5; k++) {
        const path = day.tickerPath(s, k);
        expect(path).toHaveLength(390);
        expect(path.every((v) => Number.isFinite(v))).toBe(true);
      }
    }
  });

  it('ticker mean tracks its sector within tolerance', () => {
    for (let s = 0; s < 11; s++) {
      const sectorClose = day.at(389).sectors[s]?.returnSinceOpen ?? 0;
      let mean = 0;
      for (let k = 0; k < 5; k++) mean += day.tickerPath(s, k)[389] ?? 0;
      mean /= 5;
      // Ticker idio vol is 2.2bp/min over 390 minutes → σ_day ≈ 0.43% per ticker,
      // ≈0.20% for the mean of five; 4σ tolerance (compounding widens it slightly).
      expect(Math.abs(mean - sectorClose)).toBeLessThan(0.008);
    }
  });

  it('clock labels are correct at the edges and midday', () => {
    expect(clockLabel(0)).toBe('9:30 AM');
    expect(clockLabel(389)).toBe('3:59 PM');
    expect(clockLabel(290)).toBe('2:20 PM');
    expect(clockLabel(150)).toBe('12:00 PM');
    expect(day.at(0).clock).toBe('9:30 AM');
  });

  it('at() clamps out-of-range minutes instead of throwing', () => {
    expect(day.at(-5).minute).toBe(0);
    expect(day.at(9999).minute).toBe(389);
    expect(day.at(120.4).minute).toBe(120);
  });
});
