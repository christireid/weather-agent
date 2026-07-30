/**
 * The canonical day (spec §4.5): seed 20260729 must produce the exact arc the
 * named scene states depend on. If these fail, tune engine constants — never
 * the assertions.
 */
import { describe, expect, it } from 'vitest';
import { simulateDay, DEFAULT_SEED } from '../src';

describe('canonical day (seed 20260729)', () => {
  const day = simulateDay(DEFAULT_SEED);

  const maxVolAt = (t: number): number =>
    Math.max(...day.at(t).sectors.map((s) => s.volatility));

  it('is the default seed', () => {
    expect(DEFAULT_SEED).toBe(20260729);
    expect(day.seed).toBe(20260729);
  });

  it('morning (10:00–12:00) average vol is below 45% of the day peak', () => {
    let sum = 0;
    for (let t = 30; t < 150; t++) sum += maxVolAt(t);
    const morningAvg = sum / 120;
    expect(morningAvg).toBeLessThan(0.45); // peak normalized = 1 by construction
  });

  it('the vol peak occurs between 13:45 and 15:00', () => {
    const peak = day.summary().volPeakMinute;
    expect(peak).toBeGreaterThanOrEqual(255);
    expect(peak).toBeLessThanOrEqual(330);
  });

  it('at the peak, between 3 and 5 sectors have normalized vol above 0.7', () => {
    const peak = day.summary().volPeakMinute;
    const stormy = day.at(peak).sectors.filter((s) => s.volatility > 0.7).length;
    expect(stormy).toBeGreaterThanOrEqual(3);
    expect(stormy).toBeLessThanOrEqual(5);
  });

  it('the close recovers at least 25% of the index drawdown from its post-shock low', () => {
    const shockMin = day.shock?.minute ?? 290;
    let low = Infinity;
    let preShockHigh = -Infinity;
    for (let t = 0; t < shockMin; t++) preShockHigh = Math.max(preShockHigh, day.at(t).index);
    for (let t = shockMin; t < 390; t++) low = Math.min(low, day.at(t).index);
    const drawdown = preShockHigh - low;
    const recovered = day.at(389).index - low;
    expect(drawdown).toBeGreaterThan(0);
    expect(recovered / drawdown).toBeGreaterThanOrEqual(0.25);
  });

  it('the storm state at 14:20 is visibly stormy (scene capture depends on it)', () => {
    // Within a few minutes of the impulse the sky must read as a squall.
    let maxNear = 0;
    for (let t = 290; t <= 300; t++) maxNear = Math.max(maxNear, maxVolAt(t));
    expect(maxNear).toBeGreaterThan(0.85);
  });

  it('the morning reads calm at 10:45 (field-calm capture)', () => {
    expect(maxVolAt(75)).toBeLessThan(0.5);
  });
});
