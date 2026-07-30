/** Shared types for the market engine. All figures are simulated; nothing is real data. */

export interface TickerMeta {
  /** Fictional symbol, e.g. "NWR". */
  symbol: string;
  /** Fictional company name, e.g. "Northwind Robotics". */
  name: string;
}

export interface SectorMeta {
  /** Stable index 0..10. */
  id: number;
  /** Plain industry word, e.g. "Technology". */
  name: string;
  /** URL-safe slug, e.g. "technology". */
  slug: string;
  /** Market beta in [0.6, 1.4], assigned from the seed. */
  beta: number;
  /**
   * Exposure to the macro-shock component of the market factor (the correlation
   * template of spec §4.1). High-weight sectors are the ones that turn stormy.
   */
  shockWeight: number;
  /** Five fictional constituents. */
  tickers: TickerMeta[];
}

/** Renderer-facing per-sector state at one minute. Normalized channels are documented per field. */
export interface SectorMinute {
  /** Per-minute simple return (fraction, e.g. 0.001 = +0.1%). */
  ret: number;
  /** Compounded return since 9:30 open (fraction). */
  returnSinceOpen: number;
  /**
   * EMA of recent returns squashed to [-1, 1] (drives wind direction/flow).
   * Positive = rising = flow up-right.
   */
  momentum: number;
  /**
   * Conditional volatility normalized to [0, 1] against the GLOBAL day maximum
   * across all sectors — one shared denominator, so calm sectors stay visually
   * calm during another sector's storm (spec §4.1).
   */
  volatility: number;
  /** Trading volume normalized to [0, 1] against the day's max sector-minute volume. */
  volume: number;
  /** Unnormalized volume in simulated shares (millions). */
  volumeRaw: number;
}

export interface MarketMinute {
  /** 0..389 (9:30 → 16:00). */
  minute: number;
  /** Wall-clock label, e.g. "2:20 PM". */
  clock: string;
  /** Index cumulative return since open (equal-weighted sector composite). */
  index: number;
  /** Index per-minute return. */
  indexReturn: number;
  /** Market-factor conditional volatility, normalized [0, 1] against its day max. */
  marketVol: number;
  /** The 11 sectors, in SectorMeta order. */
  sectors: SectorMinute[];
}

export interface DaySummary {
  bestSector: { name: string; slug: string; returnSinceOpen: number };
  worstSector: { name: string; slug: string; returnSinceOpen: number };
  /** Minute index (0..389) of the highest sector conditional vol, and its clock label. */
  volPeakMinute: number;
  volPeakClock: string;
  /** Peak normalized vol is 1 by construction; magnitude is the raw per-minute vol (fraction). */
  volPeakMagnitude: number;
  /** Total simulated volume across all sectors and minutes (millions of shares). */
  totalVolume: number;
  /** Index return at the close. */
  indexClose: number;
}

export interface MacroShock {
  /** Minute index (0..389) at which the impulse begins. */
  minute: number;
  /** Impulse magnitude (positive number; the impulse itself is negative). */
  magnitude: number;
}

export interface MarketDay {
  seed: number;
  sectors: SectorMeta[];
  minutes: MarketMinute[];
  /** Scheduled macro shock, or null on calm/choppy days. */
  shock: MacroShock | null;
  /** O(1) lookup of a precomputed minute. */
  at(minute: number): MarketMinute;
  /** Index cumulative-return path (390 entries) for the scrubber. */
  indexPath(): number[];
  /** Market vol path normalized [0,1] (390 entries) for the scrubber heat strip. */
  volPath(): number[];
  /** Cumulative return path for one ticker (sector 0..10, ticker 0..4). */
  tickerPath(sector: number, ticker: number): number[];
  summary(): DaySummary;
}

export type DayClass = 'flat' | 'calm-drift' | 'one-storm' | 'choppy';
