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
import { hover } from '../state/hover';
import { boring } from '../state/boring';
import { buildGlyphTargets } from '../acts/glyphTargets';
import { titleFrame } from '../acts/titleTimeline';
import { setViewTarget, snapView, tickView } from './camera';
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
          uPositionsPrev: { value: null },
          uScrubBlend: { value: 0 },
          uSectorA: { value: Array.from({ length: 11 }, () => new THREE.Vector4()) },
          uSectorB: { value: Array.from({ length: 11 }, () => new THREE.Vector4()) },
          uPoints: { value: Array.from({ length: 11 }, (_, i) => new THREE.Vector2(points[i * 2] ?? 0, points[i * 2 + 1] ?? 0)) },
          uView: { value: new THREE.Vector3(1, 0.5, 0.5) },
          uPointScale: { value: 3 },
          uAlphaScale: { value: 1 },
          uFlowTime: { value: 0 },
          uTitleGlow: { value: 0 },
          uStormEmphasis: { value: 0 },
          uRamp: { value: rampTex },
        },
      }),
    [points, rampTex],
  );
  useEffect(() => () => material.dispose(), [material]);

  // Title glyph targets — built once per sim resolution, async (font load).
  const glyphTex = useRef<THREE.DataTexture | null>(null);
  useEffect(() => {
    let dead = false;
    void buildGlyphTargets(side).then((tex) => {
      if (dead) {
        tex.dispose();
        return;
      }
      glyphTex.current = tex;
      window.__mwGlyphsReady = true;
    });
    return () => {
      dead = true;
      glyphTex.current?.dispose();
      glyphTex.current = null;
    };
  }, [side]);

  const lastGen = useRef(-1);
  const lastMs = useRef(0);
  const lastMixMs = useRef(0);
  const lastReducedMinute = useRef(-1);
  const focusStrength = useRef(0);
  const scrubBlendUntil = useRef(0);

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
    // Focus/hover state → per-sector B channels (hover lift, focus dimming).
    const focusIdx = s.focus ? day.sectors.findIndex((x) => x.slug === s.focus) : -1;
    focusStrength.current += ((focusIdx >= 0 ? 1 : 0) - focusStrength.current) * 0.075;
    for (let i = 0; i < 11; i++) {
      A[i]?.set(ch.a[i * 4] ?? 0, ch.a[i * 4 + 1] ?? 0, ch.a[i * 4 + 2] ?? 0, ch.a[i * 4 + 3] ?? 0);
      SA[i]?.set(ch.a[i * 4] ?? 0, ch.a[i * 4 + 1] ?? 0, ch.a[i * 4 + 2] ?? 0, ch.a[i * 4 + 3] ?? 0);
      const dim = focusIdx >= 0 && i !== focusIdx ? focusStrength.current : 0;
      B[i]?.set(ch.b[i * 4] ?? 0, hover.sector === i ? 1 : 0, dim, 0);
    }

    // Camera: title owns it during the title act; otherwise the focus flight.
    const su2 = sim.stepMaterial.uniforms;
    let titleGlow = 0;
    if (s.act === 'title' && !s.reducedMotion) {
      const tf = titleFrame(virtualNow());
      titleGlow = tf.shimmer;
      if (su2.uTitleMix) su2.uTitleMix.value = glyphTex.current ? tf.mix : 0;
      if (su2.uTitleShimmer) su2.uTitleShimmer.value = tf.shimmer;
      if (su2.uTitleBurst) su2.uTitleBurst.value = tf.burst;
      if (su2.uGlyphTargets && glyphTex.current) su2.uGlyphTargets.value = glyphTex.current;
      snapView(tf.zoom, 0.5, 0.5 + 0.04 * (tf.zoom - 1));
      if (tf.done) {
        s.setAct('field');
        s.setPaused(false);
      }
    } else {
      if (su2.uTitleMix) su2.uTitleMix.value = 0;
      if (su2.uTitleShimmer) su2.uTitleShimmer.value = 0;
      if (su2.uTitleBurst) su2.uTitleBurst.value = 0;
      if (focusIdx >= 0) {
        const fp = layout.points[focusIdx];
        if (fp) setViewTarget(2.05, fp.x, fp.y);
      } else {
        setViewTarget(1, 0.5, 0.5);
      }
    }
    if (su2.uFocusData) {
      const fp = focusIdx >= 0 ? layout.points[focusIdx] : null;
      (su2.uFocusData.value as THREE.Vector4).set(
        fp?.x ?? 0.5,
        fp?.y ?? 0.5,
        focusStrength.current,
        0,
      );
    }
    if (ru.uTitleGlow) ru.uTitleGlow.value = titleGlow;

    // Boring Mode settle: animated on the VIRTUAL clock so the choreography
    // is capturable frame-by-frame (Loop C boring-toggle finding). Once fully
    // settled the DOM heatmap owns the picture and the sim can idle.
    const boringTarget = s.mode === 'boring' ? 1 : 0;
    {
      const nowV = virtualNow();
      const vdt = Math.min(0.25, Math.max(0, (nowV - lastMixMs.current) / 1000));
      lastMixMs.current = nowV;
      if (s.reducedMotion) boring.mix = boringTarget;
      else boring.mix += (boringTarget - boring.mix) * (1 - Math.exp(-vdt * 4.2));
      if (Math.abs(boring.mix - boringTarget) < 0.002) boring.mix = boringTarget;
    }
    if (su2.uBoringMix) su2.uBoringMix.value = boring.mix;

    const view = tickView(1 / 60);
    (ru.uView?.value as THREE.Vector3).set(view.zoom, view.cx, view.cy);
    if (su.uFlowTime) su.uFlowTime.value = flowTime;
    if (ru.uFlowTime) ru.uFlowTime.value = flowTime;

    // Storm emphasis: anticipation over ~2 sim-minutes, impact, ~22-minute
    // decay — at default speed that is the spec's ~8 real seconds around the
    // shock. Zero on shockless days.
    let emphasis = 0;
    if (day.shock) {
      const d = s.minute - day.shock.minute;
      const rise = Math.min(1, Math.max(0, (d + 8) / 8));
      const fall = d > 0 ? Math.exp(-d / 22) : 1;
      emphasis = rise * rise * fall;
    }
    if (su.uStormEmphasis) su.uStormEmphasis.value = emphasis;
    if (ru.uStormEmphasis) ru.uStormEmphasis.value = emphasis;
    if (ru.uPointScale) {
      // Compensate small viewports: same particle count into fewer pixels
      // would fog the frame (Loop B mobile finding), so size and alpha both
      // shrink with screen area.
      const area = state.size.width * state.size.height;
      const screenFactor = Math.min(1.25, Math.max(0.5, Math.sqrt(area / (1600 * 1000))));
      ru.uPointScale.value = (s.tier === 'high' ? 4.4 : 5.6) * state.viewport.dpr * screenFactor;
      if (ru.uAlphaScale) ru.uAlphaScale.value = Math.min(1, 0.35 + 0.65 * screenFactor);
    }

    // Fully settled in Boring Mode → the DOM owns the view; skip sim work.
    if (s.mode === 'boring' && boring.mix >= 1) {
      if (ru.uPositions) ru.uPositions.value = sim.texture;
      return;
    }

    // Re-init on scrub/jump/seed change (deterministic sky per §3.2) — and in
    // reduced motion, on every displayed minute (static stills, no advection).
    const wantReinit =
      s.scrubGeneration !== lastGen.current ||
      (s.reducedMotion && Math.round(s.minute) !== lastReducedMinute.current);
    if (wantReinit) {
      const firstInit = lastGen.current === -1;
      lastGen.current = s.scrubGeneration;
      lastReducedMinute.current = Math.round(s.minute);
      sim.reinit(gl, s.seed, s.minute, flowTime);
      lastMs.current = virtualNow();
      // No crossfade on the very first init — there is no previous sky yet.
      if (!firstInit) scrubBlendUntil.current = virtualNow() + (s.reducedMotion ? 200 : 400);
    } else if (!s.reducedMotion) {
      // Fixed-step integration: large virtual-clock steps (capture harness,
      // tab-switch catch-up) substep at 60Hz so choreography never loses sim
      // time to a dt clamp (Loop C pass 1 finding). Cap keeps worst-case cost
      // bounded; anything beyond is dropped, not compressed.
      const H = 1 / 60;
      const now = virtualNow();
      let acc = (now - lastMs.current) / 1000;
      lastMs.current = now;
      let sub = 0;
      while (acc >= H && sub < 30) {
        sim.step(gl, H);
        acc -= H;
        sub++;
      }
      if (acc > 0 && sub < 30) sim.step(gl, acc);
    }

    if (ru.uPositions) ru.uPositions.value = sim.texture;
    if (ru.uPositionsPrev) ru.uPositionsPrev.value = sim.snapshotTexture;
    if (ru.uScrubBlend) {
      const remaining = scrubBlendUntil.current - virtualNow();
      ru.uScrubBlend.value = Math.min(1, Math.max(0, remaining / 400));
    }
  });

  return <points args={[geometry, material]} frustumCulled={false} />;
}
