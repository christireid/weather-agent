/**
 * The single temperature ramp (spec §6.2) — warm amber for positive return,
 * neutral parchment-grey at zero, cool blue-violet for negative. Stops are
 * interpolated in OKLab so the ramp has no muddy midtones, baked once into a
 * 256×1 lookup texture for the shaders and sampled directly for the heatmap
 * (same ramp everywhere — the metaphor contract's color channel).
 *
 * Stops (t = 0 → 1 = strong negative → strong positive), redesigned with a
 * V-shaped luminance profile — ONLY NEWS GLOWS: the zero point is a quiet
 * dark slate that recedes into the night sky, and brightness rises toward
 * both extremes (electric violet for deep losses, luminous gold for strong
 * gains). Hue travel violet → ultramarine → slate → copper → gold keeps the
 * warm/cool contract and the CVD-safe blue/yellow axis (D-018).
 *
 * Seven stops rather than five: the extra stops on each flank let the ramp
 * travel a much wider hue arc at high chroma without ever crossing the
 * warm/cool divide — the extremes scream, the middle stays quiet (D-019).
 *
 *   0.00  #9B4DFF   extreme negative (vivid violet — the panic note)
 *   0.16  #5B4BF5   strong negative (electric indigo)
 *   0.34  #2F49C9   negative (deep azure)
 *   0.50  #4A4E63   zero (quiet slate — recedes into the night)
 *   0.66  #E4611F   positive (ember orange)
 *   0.84  #FF9E1F   strong positive (molten amber)
 *   1.00  #FFE566   extreme positive (incandescent gold)
 */

export const RAMP_STOPS: readonly [number, string][] = [
  [0.0, '#9B4DFF'],
  [0.16, '#5B4BF5'],
  [0.34, '#2F49C9'],
  [0.5, '#4A4E63'],
  [0.66, '#E4611F'],
  [0.84, '#FF9E1F'],
  [1.0, '#FFE566'],
];

/** Return-since-open that saturates the ramp ends (±1.6% — beyond clamps). */
export const RAMP_RETURN_RANGE = 0.016;

// --- sRGB ↔ OKLab (Björn Ottosson's reference constants) -------------------

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16 & 0xff) / 255, (n >> 8 & 0xff) / 255, (n & 0xff) / 255];
}

type Lab = [number, number, number];

function rgbToOklab([r, g, b]: [number, number, number]): Lab {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb([L, a, bb]: Lab): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * bb) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * bb) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * bb) ** 3;
  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
  return [clamp01(linearToSrgb(lr)), clamp01(linearToSrgb(lg)), clamp01(linearToSrgb(lb))];
}

/** Sample the ramp at t ∈ [0,1] → sRGB triple in [0,1]. */
export function sampleRamp(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t));
  let i = 0;
  while (i < RAMP_STOPS.length - 2 && x > (RAMP_STOPS[i + 1]?.[0] ?? 1)) i++;
  const [t0, c0] = RAMP_STOPS[i] ?? [0, '#8E8B98'];
  const [t1, c1] = RAMP_STOPS[i + 1] ?? [1, '#8E8B98'];
  const f = t1 === t0 ? 0 : (x - t0) / (t1 - t0);
  const a = rgbToOklab(hexToRgb(c0));
  const b = rgbToOklab(hexToRgb(c1));
  const lab: Lab = [
    a[0] + (b[0] - a[0]) * f,
    a[1] + (b[1] - a[1]) * f,
    a[2] + (b[2] - a[2]) * f,
  ];
  return oklabToRgb(lab);
}

/** Map a return-since-open to ramp t. */
export function returnToT(ret: number): number {
  return Math.min(1, Math.max(0, ret / (2 * RAMP_RETURN_RANGE) + 0.5));
}

/** CSS color for DOM consumers (heatmap cells, panel accents). */
export function rampCss(t: number): string {
  const [r, g, b] = sampleRamp(t);
  const h = (v: number): string => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Relative luminance of a ramp sample (for the per-cell contrast switch, §6.2). */
export function rampLuminance(t: number): number {
  const [r, g, b] = sampleRamp(t);
  const lin = (c: number): number => srgbToLinear(c);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** 256×1 RGBA bytes for the shader lookup texture. */
export function rampTextureData(): Uint8Array {
  const data = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = sampleRamp(i / 255);
    data[i * 4] = Math.round(r * 255);
    data[i * 4 + 1] = Math.round(g * 255);
    data[i * 4 + 2] = Math.round(b * 255);
    data[i * 4 + 3] = 255;
  }
  return data;
}

/** WCAG contrast ratio between two relative luminances. */
export function contrastRatio(l1: number, l2: number): number {
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}
