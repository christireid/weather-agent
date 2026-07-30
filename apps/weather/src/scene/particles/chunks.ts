/**
 * Shared GLSL chunks, injected into the sim and render shaders so the sector
 * lookup and noise math are defined once. Plain template strings (see
 * ADR-0001 note: vite-plugin-glsl handles includes, but a TS module keeps the
 * chunks type-visible to the bundler with zero plugin magic for shared code).
 */

/**
 * Sector lookup — must match layout.ts exactly: nearest of 11 sites under a
 * vertically-compressed metric (y distances count 2.2×), so region boundaries
 * prefer to run horizontally and the sky reads as layered weather bands.
 */
export const SECTOR_LOOKUP = /* glsl */ `
uniform vec2 uPoints[11];
const float METRIC_Y = 2.2;

int sectorAt(vec2 p) {
  int best = 0;
  float bestD = 1e9;
  for (int i = 0; i < 11; i++) {
    vec2 d = p - uPoints[i];
    d.y *= METRIC_Y;
    float dd = dot(d, d);
    if (dd < bestD) { bestD = dd; best = i; }
  }
  return best;
}

// Distance from p to the nearest region boundary (difference of the two
// closest metric distances) — used for soft edge shading between bands.
float boundaryDist(vec2 p) {
  float d1 = 1e9; float d2 = 1e9;
  for (int i = 0; i < 11; i++) {
    vec2 d = p - uPoints[i];
    d.y *= METRIC_Y;
    float dd = sqrt(dot(d, d));
    if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) { d2 = dd; }
  }
  return d2 - d1;
}
`;

/**
 * Smooth sector-channel blending. A hard argmin lookup makes the flow field
 * discontinuous at region boundaries — particles pile into bright seams and
 * the sky reads as glass shards, not weather (Loop B pass 1 finding). Gaussian
 * inverse-distance weights over all 11 sites give every channel a continuous
 * field: regions keep their identity at their cores and dissolve into each
 * other at the edges, like real air masses.
 */
export const SECTOR_BLEND = /* glsl */ `
// The smooth sector-channel field, baked per frame on the CPU (see
// airField.ts): one bilinear fetch instead of an 11-site Gaussian loop —
// the loop's exp()s were the whole frame budget on software WebGL.
uniform sampler2D uAir; // momentum01, volatility, volume, tempT

vec4 airAt(vec2 p) {
  vec4 a = texture2D(uAir, clamp(p, 0.0, 1.0));
  a.x = a.x * 2.0 - 1.0; // decode momentum back to [-1, 1]
  return a;
}
`;

/**
 * Gradient value noise + curl. ψ (psi) is a two-octave scalar stream function;
 * the velocity field is its perpendicular gradient (∂ψ/∂y, −∂ψ/∂x), which is
 * divergence-free by construction — particles swirl, they never pile up.
 */
export const CURL_NOISE = /* glsl */ `
// Deterministic hash → [0,1). No texture reads, works identically everywhere.
float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

// Smooth value noise with quintic interpolation (C2 — no gradient kinks).
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Two octaves of drifting noise as the stream function. uCheapNoise drops
// the second octave on software rasterizers' live floor (D-011) — broader
// eddies, half the ψ cost.
uniform float uCheapNoise;
float psi(vec2 p, float t) {
  float n = vnoise(p + vec2(t * 0.35, t * 0.11));
  if (uCheapNoise < 0.5) {
    n += 0.5 * vnoise(p * 2.3 - vec2(t * 0.21, t * 0.33));
  }
  return n;
}

// Curl via forward differences: v = (∂ψ/∂y, −∂ψ/∂x). Forward (3 ψ evals)
// instead of central (4) — the tiny directional bias is invisible, the 25%
// shader-cost cut is not (software WebGL budget, Loop E).
vec2 curl(vec2 p, float t) {
  const float e = 0.06;
  float base = psi(p, t);
  float dy = psi(p + vec2(0.0, e), t) - base;
  float dx = psi(p + vec2(e, 0.0), t) - base;
  return vec2(dy, -dx) / e;
}
`;
