/**
 * The atmosphere: GPU particles advected through the engine-driven flow.
 * Owns the ParticleSim (FBO ping-pong), the render Points, and the per-frame
 * uniform sync. Zero allocations inside useFrame.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { dayFor, useWeather } from '../state/store';
import { channelsAt } from '../state/engineBridge';
import { tickFromRaf, virtualNow } from '../state/clock';
import { buildLayout, pointsToUniform } from './layout';
import { rampTextureData } from './ramp';
import { ParticleSim, TIER_SIDE } from './particles/sim';
import { RENDER_FRAG, RENDER_VERT } from './particles/shaders';

/** Noise/flow time is a pure function of the simulated minute → scrub-idempotent. */
export function flowTimeFor(minute: number): number {
  return minute * (90 / 390);
}

export function Particles(): React.JSX.Element {
  const gl = useThree((s) => s.gl);
  const seed = useWeather((s) => s.seed);
  const tier = useWeather((s) => s.tier);

  const layout = useMemo(() => buildLayout(seed), [seed]);
  const points = useMemo(() => pointsToUniform(layout), [layout]);

  const rampTex = useMemo(() => {
    const tex = new THREE.DataTexture(rampTextureData(), 256, 1, THREE.RGBAFormat);
    tex.needsUpdate = true;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);

  const side = TIER_SIDE[tier];
  const sim = useMemo(() => new ParticleSim(side, points), [side, points]);
  useEffect(() => () => sim.dispose(), [sim]);

  // One vertex per particle; position.xy is its uv into the position texture.
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(side * side * 3);
    for (let y = 0; y < side; y++) {
      for (let x = 0; x < side; x++) {
        const i = (y * side + x) * 3;
        arr[i] = (x + 0.5) / side;
        arr[i + 1] = (y + 0.5) / side;
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 10);
    return geo;
  }, [side]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: RENDER_VERT,
        fragmentShader: RENDER_FRAG,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uPositions: { value: null },
          uSectorA: { value: Array.from({ length: 11 }, () => new THREE.Vector4()) },
          uSectorB: { value: Array.from({ length: 11 }, () => new THREE.Vector4()) },
          uPoints: { value: Array.from({ length: 11 }, (_, i) => new THREE.Vector2(points[i * 2] ?? 0, points[i * 2 + 1] ?? 0)) },
          uView: { value: new THREE.Vector3(1, 0.5, 0.5) },
          uPointScale: { value: 3 },
          uAlphaScale: { value: 1 },
          uFlowTime: { value: 0 },
          uRamp: { value: rampTex },
        },
      }),
    [points, rampTex],
  );
  useEffect(() => () => material.dispose(), [material]);

  const lastGen = useRef(-1);
  const lastMs = useRef(0);
  const lastReducedMinute = useRef(-1);

  useFrame((state) => {
    // The rAF timestamp drives the virtual clock; in capture mode the clock
    // ignores it and only moves on window.__mw.step().
    tickFromRaf(state.clock.elapsedTime * 1000);
    const s = useWeather.getState();
    const day = dayFor(s.seed);
    const ch = channelsAt(day, s.minute);
    const flowTime = flowTimeFor(s.minute);

    // Sync engine channels into both materials' uniform arrays.
    const ru = material.uniforms;
    const su = sim.stepMaterial.uniforms;
    const A = ru.uSectorA?.value as THREE.Vector4[];
    const B = ru.uSectorB?.value as THREE.Vector4[];
    const SA = su.uSectorA?.value as THREE.Vector4[];
    for (let i = 0; i < 11; i++) {
      A[i]?.set(ch.a[i * 4] ?? 0, ch.a[i * 4 + 1] ?? 0, ch.a[i * 4 + 2] ?? 0, ch.a[i * 4 + 3] ?? 0);
      SA[i]?.set(ch.a[i * 4] ?? 0, ch.a[i * 4 + 1] ?? 0, ch.a[i * 4 + 2] ?? 0, ch.a[i * 4 + 3] ?? 0);
      B[i]?.set(ch.b[i * 4] ?? 0, ch.b[i * 4 + 1] ?? 0, ch.b[i * 4 + 2] ?? 0, 0);
    }
    if (su.uFlowTime) su.uFlowTime.value = flowTime;
    if (ru.uFlowTime) ru.uFlowTime.value = flowTime;
    if (ru.uPointScale) {
      // Compensate small viewports: same particle count into fewer pixels
      // would fog the frame (Loop B mobile finding), so size and alpha both
      // shrink with screen area.
      const area = state.size.width * state.size.height;
      const screenFactor = Math.min(1.25, Math.max(0.5, Math.sqrt(area / (1600 * 1000))));
      ru.uPointScale.value = (s.tier === 'high' ? 4.4 : 5.6) * state.viewport.dpr * screenFactor;
      if (ru.uAlphaScale) ru.uAlphaScale.value = Math.min(1, 0.35 + 0.65 * screenFactor);
    }

    // Re-init on scrub/jump/seed change (deterministic sky per §3.2) — and in
    // reduced motion, on every displayed minute (static stills, no advection).
    const wantReinit =
      s.scrubGeneration !== lastGen.current ||
      (s.reducedMotion && Math.round(s.minute) !== lastReducedMinute.current);
    if (wantReinit) {
      lastGen.current = s.scrubGeneration;
      lastReducedMinute.current = Math.round(s.minute);
      sim.reinit(gl, s.seed, s.minute, flowTime);
      lastMs.current = virtualNow();
    } else if (!s.reducedMotion) {
      const now = virtualNow();
      const dt = Math.min(0.1, (now - lastMs.current) / 1000);
      lastMs.current = now;
      if (dt > 0) sim.step(gl, dt);
    }

    if (ru.uPositions) ru.uPositions.value = sim.texture;
  });

  return <points args={[geometry, material]} frustumCulled={false} />;
}
