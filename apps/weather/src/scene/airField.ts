/**
 * The air field: per-frame sector channels baked into a 64×64 RGBA texture on
 * the CPU — (momentum01, volatility, volume, tempT) per texel, Gaussian-
 * blended over the 11 sites exactly as the shaders previously did per pixel.
 *
 * One bilinear texture fetch replaces an 11-iteration exp() loop in the sim,
 * render and sky shaders. On SwiftShader that loop was the frame budget
 * (Loop E finding: tens of millions of software exp() per frame); on hardware
 * it is still a win. 64² × 11 CPU blends per updated minute is negligible.
 */
import * as THREE from 'three';
import type { ChannelFrame } from '../state/engineBridge';
import { METRIC_Y_SCALE, type SectorLayout } from './layout';

const SIDE = 64;
const BLEND_SIGMA = 0.13; // must match the former GLSL SECTOR_BLEND

export class AirField {
  /** Double-buffered: updating a texture still referenced by in-flight frames
      forces a pipeline sync on some drivers (SwiftShader — Loop E spikes).
      Writes go to the inactive texture, then the handle swaps. */
  private textures: [THREE.DataTexture, THREE.DataTexture];
  private active = 0;
  private buffers: [Uint8Array, Uint8Array];
  /** Per-texel site weights, precomputed once per layout. */
  private weights: Float32Array; // SIDE*SIDE*11, normalized

  constructor(layout: SectorLayout) {
    this.buffers = [new Uint8Array(SIDE * SIDE * 4), new Uint8Array(SIDE * SIDE * 4)];
    this.textures = [0, 1].map((i) => {
      const tex = new THREE.DataTexture(this.buffers[i] ?? null, SIDE, SIDE, THREE.RGBAFormat);
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      return tex;
    }) as [THREE.DataTexture, THREE.DataTexture];

    this.weights = new Float32Array(SIDE * SIDE * 11);
    const inv2s2 = 1 / (2 * BLEND_SIGMA * BLEND_SIGMA);
    for (let y = 0; y < SIDE; y++) {
      for (let x = 0; x < SIDE; x++) {
        const px = (x + 0.5) / SIDE;
        const py = (y + 0.5) / SIDE;
        let sum = 1e-6;
        const base = (y * SIDE + x) * 11;
        for (let i = 0; i < 11; i++) {
          const site = layout.points[i];
          if (!site) continue;
          const dx = px - site.x;
          const dy = (py - site.y) * METRIC_Y_SCALE;
          const w = Math.exp(-(dx * dx + dy * dy) * inv2s2);
          this.weights[base + i] = w;
          sum += w;
        }
        for (let i = 0; i < 11; i++) {
          const idx = base + i;
          this.weights[idx] = (this.weights[idx] ?? 0) / sum;
        }
      }
    }
  }

  get texture(): THREE.DataTexture {
    const tex = this.textures[this.active];
    if (!tex) throw new Error('air texture missing');
    return tex;
  }

  /** Re-bake from the current channel frame (call when the displayed minute moves). */
  update(ch: ChannelFrame): void {
    const next = 1 - this.active;
    const data = this.buffers[next];
    if (!data) return;
    for (let t = 0; t < SIDE * SIDE; t++) {
      const wBase = t * 11;
      let m = 0;
      let vol = 0;
      let volu = 0;
      let temp = 0;
      for (let i = 0; i < 11; i++) {
        const w = this.weights[wBase + i] ?? 0;
        m += (ch.a[i * 4] ?? 0) * w;
        vol += (ch.a[i * 4 + 1] ?? 0) * w;
        volu += (ch.a[i * 4 + 2] ?? 0) * w;
        temp += (ch.a[i * 4 + 3] ?? 0) * w;
      }
      const o = t * 4;
      data[o] = Math.round((m * 0.5 + 0.5) * 255);
      data[o + 1] = Math.round(Math.min(1, Math.max(0, vol)) * 255);
      data[o + 2] = Math.round(Math.min(1, Math.max(0, volu)) * 255);
      data[o + 3] = Math.round(Math.min(1, Math.max(0, temp)) * 255);
    }
    const tex = this.textures[next];
    if (tex) tex.needsUpdate = true;
    this.active = next;
  }

  dispose(): void {
    this.textures[0].dispose();
    this.textures[1].dispose();
  }
}
