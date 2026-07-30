/**
 * Day-arc classification (spec §4.4) and the "new weather" rejection sampler.
 *
 * Renderer channels normalize against the day's own maximum, so classification
 * uses an ABSOLUTE reference instead: REFERENCE_PEAK_VOL is the canonical
 * day's raw peak sector vol, giving "peak normalized vol" a fixed meaning
 * across seeds. Logged as decision D-003.
 */
import { hashCombine } from './prng';
import { simulateDay, MINUTES } from './simulate';
import type { DayClass, MarketDay } from './types';

/** Raw per-minute sector vol of the canonical storm peak (measured once, pinned). */
export const REFERENCE_PEAK_VOL = 0.0026;

export interface DayClassification {
  cls: DayClass;
  /** Peak raw sector vol / REFERENCE_PEAK_VOL, clamped to [0, ~]. */
  peakVol: number;
  /** Index high−low range over the day (fraction). */
  indexRange: number;
  /** Count of distinct local maxima of abs-normalized vol above 0.5. */
  volPeaks: number;
}

/** Abs-normalized market-wide max sector vol per minute. */
function absVolSeries(day: MarketDay): number[] {
  const peak = day.summary().volPeakMagnitude;
  const series: number[] = [];
  for (let t = 0; t < MINUTES; t++) {
    const m = day.at(t);
    let maxNorm = 0;
    for (const s of m.sectors) maxNorm = Math.max(maxNorm, s.volatility);
    // s.volatility is day-relative; rescale to the absolute reference.
    series.push((maxNorm * peak) / REFERENCE_PEAK_VOL);
  }
  return series;
}

/** Count distinct local maxima above `threshold`, requiring a dip below 0.8·threshold between peaks. */
export function countVolPeaks(series: number[], threshold = 0.5): number {
  let peaks = 0;
  let armed = true;
  for (const v of series) {
    if (armed && v >= threshold) {
      peaks++;
      armed = false;
    } else if (!armed && v < threshold * 0.8) {
      armed = true;
    }
  }
  return peaks;
}

export function classifyDay(day: MarketDay): DayClassification {
  const series = absVolSeries(day);
  const peakVol = Math.max(...series);
  const path = day.indexPath();
  const indexRange = Math.max(...path) - Math.min(...path);
  const volPeaks = countVolPeaks(series);

  let cls: DayClass;
  if (day.shock) cls = 'one-storm';
  else if (peakVol < 0.35 && indexRange < 0.008) cls = 'flat';
  else if (volPeaks >= 3) cls = 'choppy';
  else cls = 'calm-drift';

  return { cls, peakVol, indexRange, volPeaks };
}

/**
 * "New weather": walk a deterministic seed sequence from `fromSeed`, rejecting
 * "flat" days, bounded at 10 attempts (then accept whatever came last).
 */
export function newWeatherSeed(fromSeed: number): number {
  let candidate = fromSeed;
  for (let attempt = 0; attempt < 10; attempt++) {
    candidate = hashCombine(fromSeed, attempt + 1) % 100000000;
    const day = simulateDay(candidate);
    if (classifyDay(day).cls !== 'flat') return candidate;
  }
  return candidate;
}
