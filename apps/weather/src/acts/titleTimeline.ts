/**
 * Title-act choreography (spec §7), driven entirely by the virtual clock:
 *   0.0–1.2s  particles gather from noise toward glyph targets
 *   1.2–3.4s  hold with slow shimmer (letters readable)
 *   3.4–5.2s  disperse into the field as the camera pulls back
 *   5.2–6.0s  HUD fades in (60ms stagger per element, CSS-side)
 * Any input from frame 1 jumps to a 400ms fast-forward of the dispersal.
 */

export interface TitleFrame {
  mix: number; // glyph attraction 0..1
  shimmer: number;
  burst: number; // dispersal gust strength
  zoom: number; // camera pullback during dispersal
  hudIn: boolean;
  done: boolean;
}

const GATHER_END = 1.2;
const HOLD_END = 3.4;
const DISPERSE_END = 5.2;
const HUD_END = 6.0;
const SKIP_MS = 0.4;

let startMs: number | null = null;
let skipAt: number | null = null;
let mixAtSkip = 1;

export function titleReset(): void {
  startMs = null;
  skipAt = null;
}

export function titleSkip(nowMs: number, currentMix: number): void {
  if (skipAt === null) {
    skipAt = nowMs;
    mixAtSkip = currentMix;
  }
}

function smooth(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

export function titleFrame(nowMs: number): TitleFrame {
  startMs ??= nowMs;
  if (skipAt !== null) {
    const t = (nowMs - skipAt) / 1000;
    const k = smooth(t / SKIP_MS);
    return {
      mix: mixAtSkip * (1 - k),
      shimmer: 0,
      burst: Math.sin(Math.min(1, t / SKIP_MS) * Math.PI),
      zoom: 1 + 0.13 * mixAtSkip * (1 - k),
      hudIn: t >= SKIP_MS * 0.5,
      done: t >= SKIP_MS,
    };
  }
  const t = (nowMs - startMs) / 1000;
  if (t < GATHER_END) {
    const k = smooth(t / GATHER_END);
    return { mix: k, shimmer: 0, burst: 0, zoom: 1.13, hudIn: false, done: false };
  }
  if (t < HOLD_END) {
    return { mix: 1, shimmer: 1, burst: 0, zoom: 1.13, hudIn: false, done: false };
  }
  if (t < DISPERSE_END) {
    const k = smooth((t - HOLD_END) / (DISPERSE_END - HOLD_END));
    // The gust peaks mid-dispersal and dies before the field settles.
    const burst = Math.sin(k * Math.PI);
    return { mix: 1 - k, shimmer: 1 - k, burst, zoom: 1.13 - 0.13 * k, hudIn: false, done: false };
  }
  return { mix: 0, shimmer: 0, burst: 0, zoom: 1, hudIn: true, done: t >= HUD_END };
}

/** Current mix (for skip fast-forward), derived without advancing state. */
export function titleCurrentMix(nowMs: number): number {
  return titleFrame(nowMs).mix;
}
