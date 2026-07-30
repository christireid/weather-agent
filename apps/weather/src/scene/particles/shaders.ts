/**
 * The four particle shaders (spec Part 7). Written for this piece and
 * commented like teaching material — no borrowed spectacle.
 *
 * Metaphor contract wiring (§2.3), per sector s with uniforms
 * uSectorA[s] = (momentum, volatility, volume, tempT) and
 * uSectorB[s] = (spike, hover, 0, 0):
 *   wind direction  ← momentum   (rising → up-right, falling → down-left)
 *   turbulence      ← volatility (eddy scale shrinks, amplitude grows)
 *   density/size    ← volume     (particle size + alpha)
 *   color           ← tempT      (return since open through the OKLab ramp)
 *   luminance pulse ← spike      (brief volume-spike brightening, bloom feeds on it)
 * Nothing else moves for decoration.
 */
import { CURL_NOISE, SECTOR_BLEND, SECTOR_LOOKUP } from './chunks';

/** Fullscreen-quad vertex shader for the simulation passes. */
export const SIM_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * Re-initialization pass (spec §3.2): positions from hash(seed, minute, id),
 * so the sky at minute t is identical however you arrived there. The warm-up
 * (90 fixed sim steps) runs after this before anything is displayed.
 */
export const INIT_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uSeedMinuteHash; // hashCombine(seed, minute) folded to [0,1) on the CPU

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

void main() {
  // Four decorrelated hashes per particle: position x/y, depth layer, personal phase.
  vec2 k = vUv + vec2(uSeedMinuteHash, uSeedMinuteHash * 0.618);
  float x = hash21(k * 1.01 + 0.13);
  float y = hash21(k * 1.37 + 7.77);
  float depth = hash21(k * 2.11 + 3.21);
  float phase = hash21(k * 3.03 + 5.55);
  gl_FragColor = vec4(x, y, depth, phase);
}
`;

/**
 * Advection step. Position texture layout: (x, y, depthLayer, personalPhase),
 * positions in field space [0,1]² (with a wrap margin).
 */
export const STEP_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uPositions;
uniform float uDt;         // seconds (virtual)
uniform float uFlowTime;   // minute-derived noise time — scrub-idempotent
${SECTOR_LOOKUP}
${SECTOR_BLEND}
${CURL_NOISE}

void main() {
  vec4 data = texture2D(uPositions, vUv);
  vec2 p = data.xy;
  vec4 chA; vec4 chB;
  blendSectors(p, chA, chB);
  float m = chA.x;
  float vol = chA.y;

  // Wind: momentum sets both direction and speed. θ ∈ [0°, 35°] from |m|;
  // the sign of m sends the flow up-right (rising) or down-left (falling).
  float th = 0.61 * abs(m);
  vec2 wind = vec2(cos(th), sin(th)) * (0.030 * m);

  // Turbulence: volatility shrinks the eddies and feeds their energy.
  float eddy = mix(3.0, 8.5, vol);
  vec2 turb = curl(p * eddy + data.w * 6.2831, uFlowTime) * (0.010 + 0.140 * vol * vol);

  // Depth layers drift at different rates — parallax gives the sky its depth.
  float depthMul = 0.55 + 0.9 * data.z;
  p += (wind + turb) * uDt * depthMul;

  // A breath of diffusion: keeps particles from collecting into hard ribbons
  // along slow eddy cores (Loop B pass 2 finding — the streak artifact).
  vec2 jitter = vec2(
    hash21(p * 311.7 + data.w * 17.0 + uFlowTime),
    hash21(p * 197.3 + data.w * 29.0 - uFlowTime)
  ) - 0.5;
  p += jitter * 0.055 * uDt;

  // Toroidal wrap into [-0.04, 1.04] (period 1.08): a small off-screen margin
  // so particles drift out of frame before reappearing on the other side.
  p = mod(p + 0.04, 1.08) - 0.04;

  gl_FragColor = vec4(p, data.zw);
}
`;

/**
 * Point rendering. Field space [0,1]² maps to clip space through uView
 * (zoom, centerX, centerY) so the Act III camera flight is one uniform.
 */
export const RENDER_VERT = /* glsl */ `
precision highp float;
uniform sampler2D uPositions;
uniform vec3 uView;        // zoom, cx, cy
uniform float uPointScale; // device pixels at zoom 1
uniform float uAlphaScale; // small-viewport compensation (fewer pixels per particle)
uniform float uFlowTime;
varying float vTempT;
varying float vAlpha;
varying float vBright;
${SECTOR_LOOKUP}
${SECTOR_BLEND}
${CURL_NOISE}

void main() {
  vec4 data = texture2D(uPositions, position.xy);
  vec2 p = data.xy;
  vec4 chA; vec4 chB;
  blendSectors(p, chA, chB);
  float vol = chA.y;
  float volume = chA.z;
  // A whisper of per-particle temperature jitter de-bands the ramp.
  vTempT = chA.w + (data.w - 0.5) * 0.04;
  float spike = chB.x;
  float hover = chB.y;
  float focusDim = chB.z;

  // Volume is density: size and opacity both breathe with it. Depth spreads
  // the layers apart — far grains are dust, near ones are soft luminous orbs.
  float depth = data.z;
  float size = uPointScale * (0.55 + 0.75 * volume) * (0.30 + 1.30 * depth) * uView.x;
  vAlpha = (0.115 + 0.135 * volume) * (0.22 + 0.78 * depth);

  // Density IS volume (§2.3): a per-particle gate thins calm regions to real
  // negative space, and a slow noise mask textures that same density into
  // cloud banks and voids instead of a uniform fill (see decisions log —
  // one channel, spatially textured; not a new visual channel).
  float gate = step(fract(data.w * 7.0), 0.48 + 0.52 * volume);
  float cloud = smoothstep(0.18, 0.82, vnoise(p * 2.7 + vec2(uFlowTime * 0.05, -uFlowTime * 0.03) + data.z * 1.7));
  vAlpha *= gate * (0.30 + 0.70 * cloud) * uAlphaScale;

  vAlpha *= mix(1.0, 0.22, focusDim); // non-focused sectors recede in Act III

  // Luminance pulse (volume spikes) + a restrained hover lift.
  vBright = (0.55 + 0.45 * depth) * (1.0 + 1.6 * spike + 0.35 * hover);
  // Stormy sectors glint slightly brighter at their core so the bloom pass
  // has something honest to bite on (channel: volatility).
  vBright *= 1.0 + 0.35 * vol;

  vec2 view = (p - uView.yz) * uView.x + 0.5;
  gl_Position = vec4(view * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = size;
}
`;

export const RENDER_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uRamp;
varying float vTempT;
varying float vAlpha;
varying float vBright;

void main() {
  // Soft round sprite, no texture fetch: quadratic falloff kills banding rings.
  vec2 d = gl_PointCoord - 0.5;
  float r2 = dot(d, d) * 4.0;
  float disc = clamp(1.0 - r2, 0.0, 1.0);
  float soft = disc * disc;
  // The ramp texture is tagged sRGB, so sampling yields linear color already.
  vec3 col = texture2D(uRamp, vec2(vTempT, 0.5)).rgb;
  gl_FragColor = vec4(col * vBright, vAlpha * soft);
}
`;

/** Sky background: vertical gradient with a hint of the sector weather. */
export const SKY_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec3 uView;
${SECTOR_LOOKUP}
${SECTOR_BLEND}

// Palette tokens (§6.2): sky #0B0C14 → upper #11131F. The render pipeline is
// linear with an sRGB output transform, so the sRGB token values are converted
// here — writing them raw was silently lifting the night sky to slate
// (Loop B pass 4 finding).
vec3 srgb2lin(vec3 c) { return pow((c + 0.055) / 1.055, vec3(2.4)); }

void main() {
  vec2 field = (vUv - 0.5) / uView.x + uView.yz;
  vec3 base  = srgb2lin(vec3(0.043, 0.047, 0.078));
  vec3 upper = srgb2lin(vec3(0.067, 0.075, 0.122));
  vec3 sky = mix(base, upper, smoothstep(0.0, 1.0, vUv.y));

  // A whisper of each region's temperature in its air (channel: return) —
  // blended continuously so the sky itself never draws polygon edges.
  vec4 chA; vec4 chB;
  blendSectors(field, chA, chB);
  vec3 warmAir = mix(srgb2lin(vec3(0.075, 0.085, 0.160)), srgb2lin(vec3(0.120, 0.095, 0.058)), chA.w);
  sky = mix(sky, warmAir, 0.35);

  gl_FragColor = vec4(sky, 1.0);
}
`;
