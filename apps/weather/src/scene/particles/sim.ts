/**
 * GPU particle simulation state — FBO ping-pong (ADR-0002).
 *
 * Positions live in a WxH float texture; each step renders a fullscreen quad
 * into the other target with STEP_FRAG. Re-initialization renders INIT_FRAG
 * from hash(seed, minute), then runs WARMUP_STEPS fixed steps so a scrub to
 * minute t shows the same sky however you arrived (spec §3.2).
 */
import * as THREE from 'three';
import { hashCombine } from '@market-weather/market';
import { INIT_FRAG, SIM_VERT, STEP_FRAG } from './shaders';

export const WARMUP_STEPS = 90;
export const WARMUP_DT = 1 / 30;

/** Particle-texture sides per tier: 448² ≈ 200k (high), 245² ≈ 60k (low). */
export const TIER_SIDE = { high: 448, low: 245 } as const;

export class ParticleSim {
  readonly side: number;
  private rtA: THREE.WebGLRenderTarget;
  private rtB: THREE.WebGLRenderTarget;
  private current = 0;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private quad: THREE.Mesh;
  readonly stepMaterial: THREE.ShaderMaterial;
  private initMaterial: THREE.ShaderMaterial;

  constructor(side: number, points: Float32Array) {
    this.side = side;
    const opts: THREE.RenderTargetOptions = {
      type: THREE.FloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
    };
    this.rtA = new THREE.WebGLRenderTarget(side, side, opts);
    this.rtB = new THREE.WebGLRenderTarget(side, side, opts);

    const sectorA = Array.from({ length: 11 }, () => new THREE.Vector4());
    this.stepMaterial = new THREE.ShaderMaterial({
      vertexShader: SIM_VERT,
      fragmentShader: STEP_FRAG,
      uniforms: {
        uPositions: { value: null },
        uSectorA: { value: sectorA },
        uPoints: { value: pointsToVec2(points) },
        uDt: { value: 0 },
        uFlowTime: { value: 0 },
      },
    });
    this.initMaterial = new THREE.ShaderMaterial({
      vertexShader: SIM_VERT,
      fragmentShader: INIT_FRAG,
      uniforms: { uSeedMinuteHash: { value: 0 } },
    });

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.stepMaterial);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  get texture(): THREE.Texture {
    return (this.current === 0 ? this.rtA : this.rtB).texture;
  }

  /** One advection step; uniforms (uSectorA, uFlowTime) must be set by the caller. */
  step(renderer: THREE.WebGLRenderer, dt: number): void {
    const read = this.current === 0 ? this.rtA : this.rtB;
    const write = this.current === 0 ? this.rtB : this.rtA;
    this.quad.material = this.stepMaterial;
    const u = this.stepMaterial.uniforms;
    if (u.uPositions) u.uPositions.value = read.texture;
    if (u.uDt) u.uDt.value = dt;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(write);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(prev);
    this.current = 1 - this.current;
  }

  /** Deterministic re-init + warm-up for minute t (spec §3.2). */
  reinit(renderer: THREE.WebGLRenderer, seed: number, minute: number, flowTime: number): void {
    const h = hashCombine(seed, Math.round(minute)) / 0xffffffff;
    this.quad.material = this.initMaterial;
    const iu = this.initMaterial.uniforms;
    if (iu.uSeedMinuteHash) iu.uSeedMinuteHash.value = h;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.current === 0 ? this.rtA : this.rtB);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(prev);
    this.quad.material = this.stepMaterial;
    // Warm-up: fixed count, fixed dt, noise time marching up to `flowTime`
    // so the settled field matches where live playback would be.
    const u = this.stepMaterial.uniforms;
    // Noise time marches at full rate through the warm-up so the flow field
    // decorrelates between steps — a frozen field lets particles converge
    // into streak ribbons along its streamlines.
    for (let k = 0; k < WARMUP_STEPS; k++) {
      if (u.uFlowTime) {
        u.uFlowTime.value = flowTime - (WARMUP_STEPS - k) * WARMUP_DT;
      }
      this.step(renderer, WARMUP_DT);
    }
    if (u.uFlowTime) u.uFlowTime.value = flowTime;
  }

  dispose(): void {
    this.rtA.dispose();
    this.rtB.dispose();
    this.stepMaterial.dispose();
    this.initMaterial.dispose();
    this.quad.geometry.dispose();
  }
}

function pointsToVec2(points: Float32Array): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  for (let i = 0; i < 11; i++) {
    out.push(new THREE.Vector2(points[i * 2] ?? 0, points[i * 2 + 1] ?? 0));
  }
  return out;
}
