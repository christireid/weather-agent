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
uniform vec4 uSectorA[11]; // momentum, volatility, volume, tempT
uniform vec4 uSectorB[11]; // spike, hover, focusDim, 0

// Blend radius in field units: ≈ half a band height.
const float BLEND_SIGMA = 0.13;

void blendSectors(vec2 p, out vec4 chA, out vec4 chB) {
  float wsum = 1e-6;
  chA = vec4(0.0);
  chB = vec4(0.0);
  for (int i = 0; i < 11; i++) {
    vec2 d = p - uPoints[i];
    d.y *= METRIC_Y;
    float w = exp(-dot(d, d) / (2.0 * BLEND_SIGMA * BLEND_SIGMA));
    chA += uSectorA[i] * w;
    chB += uSectorB[i] * w;
    wsum += w;
  }
  chA /= wsum;
  chB /= wsum;
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

// Two octaves of drifting noise as the stream function.
float psi(vec2 p, float t) {
  float n = vnoise(p + vec2(t * 0.35, t * 0.11));
  n += 0.5 * vnoise(p * 2.3 - vec2(t * 0.21, t * 0.33));
  return n;
}

// Curl via central differences: v = (∂ψ/∂y, −∂ψ/∂x).
vec2 curl(vec2 p, float t) {
  const float e = 0.06;
  float dy = psi(p + vec2(0.0, e), t) - psi(p - vec2(0.0, e), t);
  float dx = psi(p + vec2(e, 0.0), t) - psi(p - vec2(e, 0.0), t);
  return vec2(dy, -dx) / (2.0 * e);
}
`;
