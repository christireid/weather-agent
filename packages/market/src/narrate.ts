/**
 * Plain-English narration for the aria-live region and the canvas aria-label
 * (spec §5, §9.3). One generator, shared by both, so the screen-reader story
 * always matches the sky.
 *
 * Thresholds (documented per spec §5):
 *  - a sector is "stormy" when its day-normalized vol > 0.7
 *  - a sector is "brisk" when vol > 0.45
 *  - the sky is "calm" below that
 */
import type { MarketDay } from './types';

export const STORMY_VOL = 0.7;
export const BRISK_VOL = 0.45;

function listNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
}

export function describeConditions(day: MarketDay, minute: number): string {
  const m = day.at(minute);
  const stormy = m.sectors
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.volatility > STORMY_VOL)
    .map(({ i }) => day.sectors[i]?.name ?? '');
  const brisk = m.sectors.filter((s) => s.volatility > BRISK_VOL).length;

  const pct = (m.index * 100).toFixed(1);
  const dir = m.index >= 0 ? 'up' : 'down';
  const indexLine = `Index ${dir} ${Math.abs(Number(pct)).toFixed(1)}% since open.`;

  if (stormy.length > 0) {
    const verb = stormy.length === 1 ? 'is' : 'are';
    return `${m.clock} — volatility spike. ${listNames(stormy)} ${verb} stormy. ${indexLine}`;
  }
  if (brisk >= 3) {
    return `${m.clock} — brisk winds across ${brisk} sectors. ${indexLine}`;
  }
  return `${m.clock} — calm skies. ${indexLine}`;
}

/** Canvas aria-label: same generator, prefixed (spec §9.3). */
export function canvasLabel(day: MarketDay, minute: number): string {
  return `Simulated market weather. ${describeConditions(day, minute)}`;
}
