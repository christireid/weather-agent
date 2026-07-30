import { describe, expect, it } from 'vitest';
import { classifyDay, newWeatherSeed, countVolPeaks, simulateDay } from '../src';

describe('archetype classifier', () => {
  it('classifies the canonical day as one-storm', () => {
    expect(classifyDay(simulateDay(20260729)).cls).toBe('one-storm');
  });

  it('every shock day is one-storm', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const day = simulateDay(seed);
      if (day.shock) expect(classifyDay(day).cls).toBe('one-storm');
    }
  });

  it('no-shock days classify as flat, calm-drift or choppy', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const day = simulateDay(seed);
      if (!day.shock) {
        expect(['flat', 'calm-drift', 'choppy']).toContain(classifyDay(day).cls);
      }
    }
  });

  it('classification is deterministic', () => {
    for (const seed of [3, 14, 159]) {
      expect(classifyDay(simulateDay(seed))).toEqual(classifyDay(simulateDay(seed)));
    }
  });

  it('countVolPeaks counts distinct maxima with hysteresis', () => {
    expect(countVolPeaks([0, 0.6, 0, 0.6, 0, 0.6, 0])).toBe(3);
    expect(countVolPeaks([0, 0.6, 0.55, 0.6, 0])).toBe(1); // no dip below 0.4 between
    expect(countVolPeaks([0.2, 0.3, 0.2])).toBe(0);
  });

  it('newWeatherSeed is deterministic and avoids flat days when possible', () => {
    const a = newWeatherSeed(20260729);
    expect(newWeatherSeed(20260729)).toBe(a);
    expect(classifyDay(simulateDay(a)).cls).not.toBe('flat');
  });

  it('newWeatherSeed differs from its starting seed', () => {
    expect(newWeatherSeed(20260729)).not.toBe(20260729);
  });
});
