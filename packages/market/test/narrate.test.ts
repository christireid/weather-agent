import { describe, expect, it } from 'vitest';
import { describeConditions, canvasLabel, simulateDay } from '../src';

describe('narration', () => {
  const day = simulateDay(20260729);

  it('narrates the storm with stormy sector names and index state', () => {
    const text = describeConditions(day, 292);
    expect(text).toContain('volatility spike');
    expect(text).toMatch(/^2:2\d PM —/);
    expect(text).toMatch(/Index (up|down) \d+\.\d% since open\./);
    // At least one sector is named.
    expect(day.sectors.some((s) => text.includes(s.name))).toBe(true);
  });

  it('narrates a calm morning as calm', () => {
    const text = describeConditions(day, 75);
    expect(text).toContain('calm skies');
    expect(text).toContain('10:45 AM');
  });

  it('canvas label shares the generator and prefixes the simulation notice', () => {
    const label = canvasLabel(day, 290);
    expect(label.startsWith('Simulated market weather. ')).toBe(true);
    expect(label).toContain(describeConditions(day, 290));
  });

  it('narration is deterministic', () => {
    expect(describeConditions(day, 200)).toBe(describeConditions(simulateDay(20260729), 200));
  });
});
