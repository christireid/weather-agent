import { describe, expect, it } from 'vitest';
import { simulateDay } from '../src';

describe('storm scheduling', () => {
  it('at most one macro shock per day (shock is scalar or null)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const day = simulateDay(seed);
      if (day.shock) {
        expect(typeof day.shock.minute).toBe('number');
        expect(typeof day.shock.magnitude).toBe('number');
      } else {
        expect(day.shock).toBeNull();
      }
    }
  });

  it('scheduled shocks fall inside the afternoon window (13:00–15:00)', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const day = simulateDay(seed);
      if (day.shock && seed !== 20260729) {
        expect(day.shock.minute).toBeGreaterThanOrEqual(210);
        expect(day.shock.minute).toBeLessThanOrEqual(330);
      }
    }
  });

  it('roughly 60% of seeds schedule a shock (40–80% over 100 seeds)', () => {
    let count = 0;
    for (let seed = 1; seed <= 100; seed++) {
      if (simulateDay(seed).shock) count++;
    }
    expect(count).toBeGreaterThanOrEqual(40);
    expect(count).toBeLessThanOrEqual(80);
  });

  it('the default seed schedules its shock at minute 290 (2:20 PM)', () => {
    const day = simulateDay(20260729);
    expect(day.shock?.minute).toBe(290);
  });

  it('shock magnitude is inside the documented range', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const day = simulateDay(seed);
      if (day.shock) {
        expect(day.shock.magnitude).toBeGreaterThanOrEqual(0.008);
        expect(day.shock.magnitude).toBeLessThanOrEqual(0.014);
      }
    }
  });

  it('high shock-weight sectors move more at the shock than low-weight sectors', () => {
    const day = simulateDay(20260729);
    const shockMin = day.shock?.minute ?? 0;
    const weights = day.sectors.map((s) => s.shockWeight);
    const moves = day.at(shockMin).sectors.map((s) => Math.abs(s.ret));
    const hi = avgWhere(moves, weights, (w) => w > 1);
    const lo = avgWhere(moves, weights, (w) => w <= 1);
    expect(hi).toBeGreaterThan(lo * 1.5);
  });

  function avgWhere(xs: number[], ws: number[], pred: (w: number) => boolean): number {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < xs.length; i++) {
      if (pred(ws[i] ?? 0)) {
        sum += xs[i] ?? 0;
        n++;
      }
    }
    return n === 0 ? 0 : sum / n;
  }
});
