/**
 * Frame-loop hygiene (spec Part 7): the engine is queried at most once per
 * rendered frame, channels are memoized per minute pair and interpolated for
 * smooth motion, and no per-frame allocations escape this module (buffers are
 * reused).
 */
import type { MarketDay } from '@market-weather/market';

export interface ChannelFrame {
  /** Per sector: momentum, volatility, volume, tempT (ramp coordinate). */
  a: Float32Array; // 11 × 4
  /** Per sector: spike, hover, focusDim (hover/focusDim written by the scene). */
  b: Float32Array; // 11 × 4
}

import { RAMP_RETURN_RANGE } from '../scene/ramp';

const frame: ChannelFrame = { a: new Float32Array(44), b: new Float32Array(44) };
let cachedKey = '';

/** Volume-spike detection: volume above its trailing EMA by this margin pulses. */
const SPIKE_MARGIN = 0.18;
const EMA_ALPHA = 0.12;
const emaCache = new Map<string, Float32Array>();

function volumeEma(day: MarketDay, minute: number): Float32Array {
  const key = `${day.seed}`;
  let arr = emaCache.get(key);
  if (!arr) {
    // Precompute trailing EMA of volume per sector across the day, once.
    arr = new Float32Array(390 * 11);
    const acc = new Float32Array(11);
    for (let t = 0; t < 390; t++) {
      const m = day.at(t);
      for (let s = 0; s < 11; s++) {
        const v = m.sectors[s]?.volume ?? 0;
        acc[s] = t === 0 ? v : (acc[s] ?? 0) * (1 - EMA_ALPHA) + v * EMA_ALPHA;
        arr[t * 11 + s] = acc[s] ?? 0;
      }
    }
    emaCache.clear();
    emaCache.set(key, arr);
  }
  const t = Math.max(0, Math.min(389, Math.round(minute)));
  return arr.subarray(t * 11, t * 11 + 11);
}

/**
 * Fill the shared ChannelFrame for a fractional minute (linear interpolation
 * between the two bracketing minutes). Returns the same buffers every call.
 */
export function channelsAt(day: MarketDay, minute: number): ChannelFrame {
  const key = `${day.seed}:${minute.toFixed(3)}`;
  if (key === cachedKey) return frame;
  cachedKey = key;

  const t0 = Math.floor(Math.max(0, Math.min(389, minute)));
  const t1 = Math.min(389, t0 + 1);
  const f = Math.max(0, Math.min(1, minute - t0));
  const m0 = day.at(t0);
  const m1 = day.at(t1);
  const ema = volumeEma(day, minute);

  for (let s = 0; s < 11; s++) {
    const a0 = m0.sectors[s];
    const a1 = m1.sectors[s];
    if (!a0 || !a1) continue;
    const momentum = a0.momentum + (a1.momentum - a0.momentum) * f;
    const vol = a0.volatility + (a1.volatility - a0.volatility) * f;
    // √-compress volume for display: the shock-minute spike owns the linear
    // normalization and was squashing the whole rest of the day to near-zero
    // density (Loop C regime finding). Monotone transform, same channel.
    const volume = Math.sqrt(Math.max(0, a0.volume + (a1.volume - a0.volume) * f));
    const ret = a0.returnSinceOpen + (a1.returnSinceOpen - a0.returnSinceOpen) * f;
    const tempT = Math.min(1, Math.max(0, ret / (2 * RAMP_RETURN_RANGE) + 0.5));
    frame.a[s * 4] = momentum;
    frame.a[s * 4 + 1] = vol;
    frame.a[s * 4 + 2] = volume;
    frame.a[s * 4 + 3] = tempT;
    const spike = Math.max(0, volume - (ema[s] ?? 0) - SPIKE_MARGIN) * 2.5;
    frame.b[s * 4] = Math.min(1, spike);
    // b[1] (hover) and b[2] (focusDim) are owned by the scene layer.
  }
  return frame;
}
