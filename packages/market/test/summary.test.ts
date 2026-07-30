import { describe, expect, it } from 'vitest';
import { simulateDay } from '../src';

describe('summary', () => {
  const day = simulateDay(20260729);
  const summary = day.summary();

  it('best/worst sectors match brute-force recomputation', () => {
    const close = day.at(389);
    const rets = close.sectors.map((s) => s.returnSinceOpen);
    const best = Math.max(...rets);
    const worst = Math.min(...rets);
    expect(summary.bestSector.returnSinceOpen).toBe(best);
    expect(summary.worstSector.returnSinceOpen).toBe(worst);
    const bestIdx = rets.indexOf(best);
    const worstIdx = rets.indexOf(worst);
    expect(summary.bestSector.name).toBe(day.sectors[bestIdx]?.name);
    expect(summary.worstSector.name).toBe(day.sectors[worstIdx]?.name);
  });

  it('vol peak clock label matches the peak minute', () => {
    expect(summary.volPeakClock).toBe(day.at(summary.volPeakMinute).clock);
  });

  it('vol peak magnitude is the day maximum of raw sector vol', () => {
    // The normalized channel hits exactly 1 at that minute for some sector.
    const atPeak = day.at(summary.volPeakMinute).sectors.map((s) => s.volatility);
    expect(Math.max(...atPeak)).toBeCloseTo(1, 10);
  });

  it('index close matches the last minute', () => {
    expect(summary.indexClose).toBe(day.at(389).index);
  });

  it('summary is stable across calls', () => {
    expect(day.summary()).toEqual(summary);
  });
});
