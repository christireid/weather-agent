/** Seed archetype scan (spec §4.4): classify seeds 1–200 and print the census. */
import { classifyDay, simulateDay } from '../src/index';
import type { DayClass } from '../src/types';

const counts: Record<DayClass, number> = {
  flat: 0,
  'calm-drift': 0,
  'one-storm': 0,
  choppy: 0,
};

for (let seed = 1; seed <= 200; seed++) {
  const day = simulateDay(seed);
  const c = classifyDay(day);
  counts[c.cls]++;
  console.log(
    `seed ${seed.toString().padStart(3)}  ${c.cls.padEnd(10)}  peakVol ${c.peakVol.toFixed(2)}  range ${(c.indexRange * 100).toFixed(2)}%  volPeaks ${c.volPeaks}`,
  );
}

console.log('\ncensus:', counts);
