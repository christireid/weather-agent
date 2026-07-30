/**
 * The market-day simulation (spec Part 4).
 *
 * One seeded stream drives everything in a fixed draw order:
 *   1. sector metadata (betas, shock-weight template)
 *   2. shock schedule
 *   3. per-minute market factor, sector idiosyncratics, ticker idiosyncratics, volume noise
 *
 * The renderer is a pure projection of the resulting MarketDay.
 */
import { createRng, hashCombine } from './prng';
import { buildSectors, SECTOR_COUNT, TICKERS_PER_SECTOR } from './sectors';
import type {
  DaySummary,
  MacroShock,
  MarketDay,
  MarketMinute,
  SectorMinute,
} from './types';

export const MINUTES = 390; // 9:30 → 16:00, one-minute steps
export const DEFAULT_SEED = 20260729;

// ---------------------------------------------------------------------------
// Constants — every number here was tuned so the canonical day (seed 20260729)
// satisfies the Part 4.5 arc; tests pin the behavior, comments explain intent.
// ---------------------------------------------------------------------------

/** Base per-minute market-factor vol: ~5bp/min ≈ 1% daily (1%/√390). */
const MARKET_BASE_VOL = 5e-4;

/**
 * GARCH(1,1)-flavored clustering: vol² ← A + B·shock² + C·vol².
 * B + C = 0.94 → echo half-life ≈ ln2/(1−0.94) ≈ 11 minutes, so a macro shock
 * reverberates for tens of minutes then hands the day back. B is kept small
 * relative to C so the post-shock envelope decays rather than random-walking
 * upward on lucky draws (a larger B made the day's vol peak land after the
 * shock, which broke the canonical arc — see docs/decisions-log.md D-004).
 */
const GARCH_B = 0.06;
const GARCH_C = 0.88;

/** Sector idiosyncratic vol: smaller than the market factor so correlation reads. */
const SECTOR_IDIO_VOL = 3.2e-4;

/** Ticker idiosyncratic vol (smaller variance than sector idio, spec §4.1). */
const TICKER_IDIO_VOL = 2.2e-4;

/** Probability a seed schedules one macro shock (spec: ~60%). */
const SHOCK_PROBABILITY = 0.6;
/** Afternoon window for shock scheduling: 13:00–15:00 (minutes 210–330). */
const SHOCK_WINDOW = [210, 330] as const;
/** Canonical day: the default seed pins its shock to 14:20 (minute 290). */
const CANONICAL_SHOCK_MINUTE = 290;

/**
 * Shock impulse: a negative market-factor jolt spread over several minutes
 * (markets gap down over minutes, not one tick). Magnitude is per-seed.
 */
const SHOCK_SPREAD_MINUTES = 6;
const SHOCK_MAGNITUDE_RANGE = [0.008, 0.014] as const; // 0.8%–1.4% total impulse

/**
 * Post-shock recovery: a gentle mean-reverting drift for the rest of the day,
 * proportional to the shock. Tuned so the canonical close retraces ≥25% of the
 * drawdown from the post-shock low (spec §4.5) without reading as a V-bounce.
 */
const RECOVERY_DRIFT_FRACTION = 0.55; // fraction of the impulse returned by the close, pre-noise

/** Momentum EMA half-life in minutes, and the squash scale mapping it to [-1,1]. */
const MOMENTUM_HALF_LIFE = 12;
const MOMENTUM_SCALE = 8e-4;

/** Volume model: U-shaped baseline (deep midday trough) times an activity multiplier. */
const VOLUME_BASE = 6.0; // millions of shares per sector-minute at the midday trough
const VOLUME_U_DEPTH = 1.6; // open/close run ~2.6× the trough before noise
const VOLUME_RETURN_COUPLING = 900; // volume ≈ ×1.9 on a 10bp minute — shocks bring volume
const VOLUME_NOISE = 0.12;

/** Minute → "9:30 AM" / "2:20 PM" label. */
export function clockLabel(minute: number): string {
  const total = 9 * 60 + 30 + minute;
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const h12 = ((h24 + 11) % 12) + 1;
  const ampm = h24 < 12 ? 'AM' : 'PM';
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function idx<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`index ${i} out of bounds`);
  return v;
}

export function simulateDay(seed: number = DEFAULT_SEED): MarketDay {
  const rng = createRng(seed);

  // 1 — sector metadata (fixed draw count).
  const sectors = buildSectors(rng);

  // 2 — shock schedule. Draw both numbers unconditionally so the stream
  // position is identical for shock and no-shock days.
  const shockRoll = rng.next();
  const shockMinuteDraw = Math.floor(rng.range(SHOCK_WINDOW[0], SHOCK_WINDOW[1]));
  const shockMagnitude = rng.range(SHOCK_MAGNITUDE_RANGE[0], SHOCK_MAGNITUDE_RANGE[1]);
  const hasShock = seed === DEFAULT_SEED ? true : shockRoll < SHOCK_PROBABILITY;
  const shockMinute = seed === DEFAULT_SEED ? CANONICAL_SHOCK_MINUTE : shockMinuteDraw;
  const shock: MacroShock | null = hasShock
    ? { minute: shockMinute, magnitude: shockMagnitude }
    : null;

  // 2b — day character, drawn from a SEPARATE hashed stream so adding these
  // draws never shifts the main stream (the canonical day stays bit-identical).
  // Shock days keep multiplier 1 (the storm calibration owns them); no-shock
  // days vary between hushed (flat) and blustery (choppy) archetypes.
  const charRng = createRng(hashCombine(seed, 0xda71));
  const multDraw = charRng.range(0.55, 1.4);
  const gustyDraw = charRng.next();
  const gustCount = 3 + charRng.int(2);
  const gustSpecs = Array.from({ length: 4 }, (_, i) => ({
    minute: 50 + i * 85 + charRng.int(45),
    amp: charRng.range(0.0035, 0.005),
    sign: charRng.next() < 0.5 ? -1 : 1,
  }));
  const dayVolMult = hasShock ? 1 : multDraw;
  const gusts = !hasShock && gustyDraw < 0.45 ? gustSpecs.slice(0, gustCount) : [];

  const marketBaseVol = MARKET_BASE_VOL * dayVolMult;
  const sectorIdioVol = SECTOR_IDIO_VOL * dayVolMult;
  const garchA = marketBaseVol * marketBaseVol * (1 - GARCH_B - GARCH_C);
  const sectorGarchA = sectorIdioVol * sectorIdioVol * (1 - GARCH_B - GARCH_C);

  // 3 — per-minute simulation.
  const marketReturns = new Float64Array(MINUTES);
  const marketVols = new Float64Array(MINUTES);
  const sectorReturns: Float64Array[] = Array.from(
    { length: SECTOR_COUNT },
    () => new Float64Array(MINUTES),
  );
  const sectorVols: Float64Array[] = Array.from(
    { length: SECTOR_COUNT },
    () => new Float64Array(MINUTES),
  );
  const sectorCum: Float64Array[] = Array.from(
    { length: SECTOR_COUNT },
    () => new Float64Array(MINUTES),
  );
  const tickerCum: Float64Array[] = Array.from(
    { length: SECTOR_COUNT * TICKERS_PER_SECTOR },
    () => new Float64Array(MINUTES),
  );
  const volumes: Float64Array[] = Array.from(
    { length: SECTOR_COUNT },
    () => new Float64Array(MINUTES),
  );

  let marketVar = marketBaseVol * marketBaseVol;
  const sectorVar = sectors.map(() => sectorIdioVol * sectorIdioVol);
  const sectorCumAcc = sectors.map(() => 1); // compounding accumulators
  const tickerCumAcc: number[] = Array.from(
    { length: SECTOR_COUNT * TICKERS_PER_SECTOR },
    () => 1,
  );
  const momentumAlpha = 1 - Math.pow(0.5, 1 / MOMENTUM_HALF_LIFE);

  // Recovery drift applies from shock end to the close.
  const recoveryPerMinute = shock
    ? (shock.magnitude * RECOVERY_DRIFT_FRACTION) /
      Math.max(1, MINUTES - (shock.minute + SHOCK_SPREAD_MINUTES))
    : 0;

  for (let t = 0; t < MINUTES; t++) {
    // Market factor: GARCH vol, zero drift, plus the shock impulse when active.
    const marketVol = Math.sqrt(marketVar);
    const z = rng.normal();
    let shockComponent = 0;
    if (shock && t >= shock.minute && t < shock.minute + SHOCK_SPREAD_MINUTES) {
      // Front-loaded impulse: half the magnitude in the first minute, the rest
      // decaying across the spread window.
      const k = t - shock.minute;
      const w = k === 0 ? 0.5 : 0.5 / (SHOCK_SPREAD_MINUTES - 1);
      shockComponent = -shock.magnitude * w * (k === 0 ? 1 : 1.4 - 0.4 * (k / (SHOCK_SPREAD_MINUTES - 1)));
    }
    const recovery = shock && t >= shock.minute + SHOCK_SPREAD_MINUTES ? recoveryPerMinute : 0;
    // Gusts (no-shock choppy days): short alternating-sign squalls in the
    // market factor — enough to kick the vol envelope, small enough to read
    // as chop rather than a storm.
    let gust = 0;
    for (const g of gusts) {
      const k = t - g.minute;
      if (k >= 0 && k < 3) gust += g.amp * g.sign * (k % 2 === 0 ? 1 : -1);
    }
    const marketBase = z * marketVol + recovery + gust;
    const marketReturn = marketBase + shockComponent;
    marketReturns[t] = marketReturn;
    marketVols[t] = marketVol;
    // Clustering feedback. The macro impulse enters market vol² damped (λ):
    // undamped, the post-shock market factor ran hot enough that individual
    // sectors' own GARCH loops could out-spike the storm itself minutes later,
    // moving the day's vol peak away from 14:20 (decision D-004). Sector echo
    // comes from each sector's own b·shock² term, which sees the full impulse.
    const SHOCK_FEEDBACK_DAMP = 0.25;
    const fb = marketBase + SHOCK_FEEDBACK_DAMP * shockComponent;
    marketVar = garchA + GARCH_B * fb * fb + GARCH_C * marketVar;

    for (let s = 0; s < SECTOR_COUNT; s++) {
      const meta = idx(sectors, s);
      const idioVol = Math.sqrt(idx(sectorVar, s));
      const idio = rng.normal() * idioVol;
      // One-factor model; the shock component routes through the correlation
      // template (shockWeight), not beta — that is what makes a storm cluster.
      const ret = meta.beta * marketBase + meta.shockWeight * shockComponent + idio;
      idx(sectorReturns, s)[t] = ret;

      // Sector conditional vol: GARCH on the sector's own realized return, so
      // shocked sectors spike hard and echo while calm sectors stay near base.
      const prevVar = idx(sectorVar, s);
      sectorVar[s] = sectorGarchA + GARCH_B * ret * ret + GARCH_C * prevVar;
      idx(sectorVols, s)[t] = Math.sqrt(idx(sectorVar, s));

      sectorCumAcc[s] = idx(sectorCumAcc, s) * (1 + ret);
      idx(sectorCum, s)[t] = idx(sectorCumAcc, s) - 1;

      // Tickers: sector return plus smaller idiosyncratic noise.
      for (let k = 0; k < TICKERS_PER_SECTOR; k++) {
        const ti = s * TICKERS_PER_SECTOR + k;
        const tRet = ret + rng.normal() * TICKER_IDIO_VOL;
        tickerCumAcc[ti] = idx(tickerCumAcc, ti) * (1 + tRet);
        idx(tickerCum, ti)[t] = idx(tickerCumAcc, ti) - 1;
      }

      // Volume: U-shaped baseline × return coupling × noise.
      const x = (t - (MINUTES - 1) / 2) / ((MINUTES - 1) / 2); // -1..1 across the day
      const uShape = 1 + VOLUME_U_DEPTH * x * x;
      const activity = 1 + VOLUME_RETURN_COUPLING * Math.abs(ret);
      const noise = 1 + VOLUME_NOISE * (rng.next() * 2 - 1);
      idx(volumes, s)[t] = VOLUME_BASE * uShape * activity * noise;
    }
  }

  // 4 — normalization denominators (global day maxima; spec §4.1).
  let volMax = 0;
  let volumeMax = 0;
  for (let s = 0; s < SECTOR_COUNT; s++) {
    for (let t = 0; t < MINUTES; t++) {
      volMax = Math.max(volMax, idx(sectorVols, s)[t] ?? 0);
      volumeMax = Math.max(volumeMax, idx(volumes, s)[t] ?? 0);
    }
  }
  let marketVolMax = 0;
  for (let t = 0; t < MINUTES; t++) marketVolMax = Math.max(marketVolMax, marketVols[t] ?? 0);

  // 5 — assemble minutes. Momentum needs a second pass EMA (recomputed so the
  // stream above keeps a fixed draw order regardless of formulas here).
  const minutes: MarketMinute[] = [];
  const momentum = sectors.map(() => 0);
  for (let t = 0; t < MINUTES; t++) {
    const secs: SectorMinute[] = [];
    for (let s = 0; s < SECTOR_COUNT; s++) {
      const ret = idx(sectorReturns, s)[t] ?? 0;
      momentum[s] = idx(momentum, s) * (1 - momentumAlpha) + ret * momentumAlpha;
      secs.push({
        ret,
        returnSinceOpen: idx(sectorCum, s)[t] ?? 0,
        momentum: clamp(Math.tanh(idx(momentum, s) / MOMENTUM_SCALE), -1, 1),
        volatility: clamp((idx(sectorVols, s)[t] ?? 0) / volMax, 0, 1),
        volume: clamp((idx(volumes, s)[t] ?? 0) / volumeMax, 0, 1),
        volumeRaw: idx(volumes, s)[t] ?? 0,
      });
    }
    // Index: DEFINED as the equal-weighted average of sector cumulative returns.
    const index = secs.reduce((acc, x) => acc + x.returnSinceOpen, 0) / SECTOR_COUNT;
    const prev = t > 0 ? (idx(minutes, t - 1).index ?? 0) : 0;
    minutes.push({
      minute: t,
      clock: clockLabel(t),
      index,
      indexReturn: t > 0 ? (1 + index) / (1 + prev) - 1 : index,
      marketVol: clamp((marketVols[t] ?? 0) / marketVolMax, 0, 1),
      sectors: secs,
    });
  }

  // 6 — summary (computed once; day.summary() returns the frozen result).
  const last = idx(minutes, MINUTES - 1);
  let best = 0;
  let worst = 0;
  for (let s = 1; s < SECTOR_COUNT; s++) {
    if (idx(last.sectors, s).returnSinceOpen > idx(last.sectors, best).returnSinceOpen) best = s;
    if (idx(last.sectors, s).returnSinceOpen < idx(last.sectors, worst).returnSinceOpen) worst = s;
  }
  let peakT = 0;
  let peakVol = 0;
  for (let s = 0; s < SECTOR_COUNT; s++) {
    for (let t = 0; t < MINUTES; t++) {
      const v = idx(sectorVols, s)[t] ?? 0;
      if (v > peakVol) {
        peakVol = v;
        peakT = t;
      }
    }
  }
  const totalVolume = volumes.reduce((acc, arr) => acc + arr.reduce((a, b) => a + b, 0), 0);
  const summary: DaySummary = {
    bestSector: {
      name: idx(sectors, best).name,
      slug: idx(sectors, best).slug,
      returnSinceOpen: idx(last.sectors, best).returnSinceOpen,
    },
    worstSector: {
      name: idx(sectors, worst).name,
      slug: idx(sectors, worst).slug,
      returnSinceOpen: idx(last.sectors, worst).returnSinceOpen,
    },
    volPeakMinute: peakT,
    volPeakClock: clockLabel(peakT),
    volPeakMagnitude: peakVol,
    totalVolume,
    indexClose: last.index,
  };

  const indexPathArr = minutes.map((m) => m.index);
  const volPathArr = minutes.map((m) => m.marketVol);

  return {
    seed,
    sectors,
    minutes,
    shock,
    at: (minute: number) => idx(minutes, clamp(Math.round(minute), 0, MINUTES - 1)),
    indexPath: () => indexPathArr,
    volPath: () => volPathArr,
    tickerPath: (s: number, k: number) => Array.from(idx(tickerCum, s * TICKERS_PER_SECTOR + k)),
    summary: () => summary,
  };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
