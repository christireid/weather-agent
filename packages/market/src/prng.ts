/**
 * Deterministic randomness for the whole project.
 *
 * One algorithm (mulberry32), one seeding rule. The engine draws every random
 * number from a single stream in a fixed order, so a seed maps to exactly one
 * MarketDay on every machine. The renderer re-seeds particle distributions from
 * `hashCombine(seed, minute)` so a scrub to minute t always reproduces the same
 * sky however you arrived there (spec §3.2).
 */

/** mulberry32 — small, fast, well-distributed 32-bit PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mix two 32-bit values into one well-distributed 32-bit hash (for minute re-seeding). */
export function hashCombine(a: number, b: number): number {
  // Multiply between the two XOR folds so the mix is order-sensitive
  // (a plain (a ^ K) ^ b would be symmetric in a and b).
  let h = Math.imul((a >>> 0) ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (b >>> 0), 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 16;
  return h >>> 0;
}

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform in [min, max). */
  range(min: number, max: number): number;
  /** Standard normal via Box–Muller (two uniforms per draw, no caching → stable draw order). */
  normal(): number;
  /** Integer in [0, n). */
  int(n: number): number;
}

export function createRng(seed: number): Rng {
  const next = mulberry32(seed);
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    normal: () => {
      // Box–Muller. Guard u1 away from 0 so log() stays finite.
      const u1 = Math.max(next(), 1e-12);
      const u2 = next();
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    },
    int: (n) => Math.floor(next() * n),
  };
}
