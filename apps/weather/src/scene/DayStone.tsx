/**
 * Act IV — the day, turned. When the market closes, the day condenses into a
 * vessel whose GEOMETRY is the data (D-015/D-017):
 *
 *   lathe profile   ← the index path itself, revolved — a drawdown is a
 *                     literal choke in the silhouette, a rally a swelling
 *   band color      ← index return since open at that minute (OKLab ramp),
 *                     open at the foot, close at the lip
 *   surface rough.  ← the day's realized vol (stormy days turn rougher)
 *   ember shimmer   ← D-016 shader extension, unchanged (vColor + aFacet)
 *   rotation / bob  ← presentation transform, virtual-clocked, still under
 *                     prefers-reduced-motion
 *
 * Real turned geometry (LatheGeometry from a smoothed 72-point resample of
 * the 390-minute path, flat-shaded 44-segment revolve), PBR + injected
 * shaders, perspective camera, key + hemisphere + rim lights. Every seed
 * turns a different vessel.
 */
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { classifyDay, type MarketDay } from '@market-weather/market';
import { dayFor, useWeather } from '../state/store';
import { virtualNow } from '../state/clock';
import { sampleRamp, returnToT } from './ramp';

const PROFILE_POINTS = 72;
const LATHE_SEGMENTS = 44;

function buildVesselGeometry(day: MarketDay): THREE.BufferGeometry {
  const path = day.indexPath(); // 390 per-minute index values

  // Resample the day to the profile resolution with a light moving average —
  // the lathe wants a turnable curve, not minute noise.
  const resampled: number[] = [];
  for (let i = 0; i < PROFILE_POINTS; i++) {
    const center = (i / (PROFILE_POINTS - 1)) * 389;
    let sum = 0;
    let n = 0;
    for (let k = -6; k <= 6; k++) {
      const t = Math.round(center + k);
      if (t >= 0 && t <= 389) {
        sum += path[t] ?? 0;
        n++;
      }
    }
    resampled.push(sum / Math.max(1, n));
  }
  const lo = Math.min(...resampled);
  const hi = Math.max(...resampled);
  const span = Math.max(1e-6, hi - lo);

  // Profile: radius carries the index (a drawdown chokes the vessel, a rally
  // swells it); height carries time, open at the foot → close at the lip.
  const profile: THREE.Vector2[] = [new THREE.Vector2(0.04, -1.06)];
  for (let i = 0; i < PROFILE_POINTS; i++) {
    const r = 0.44 + (((resampled[i] ?? 0) - lo) / span) * 0.62;
    const y = -1 + (i / (PROFILE_POINTS - 1)) * 2;
    profile.push(new THREE.Vector2(r, y));
  }
  profile.push(new THREE.Vector2(0.04, 1.06)); // close the lip

  const geo = new THREE.LatheGeometry(profile, LATHE_SEGMENTS);

  // Band colors: each profile row is its minute's index return through the
  // ramp. LatheGeometry UV.y runs along the profile → recover the minute.
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  const colors = new Float32Array(pos.count * 3);
  const bandIds = new Float32Array(pos.count);
  const rows = profile.length;
  for (let i = 0; i < pos.count; i++) {
    const v = uv.getY(i); // 0 at foot → 1 at lip
    const row = Math.round(v * (rows - 1));
    const pi = Math.max(0, Math.min(PROFILE_POINTS - 1, row - 1));
    const minute = Math.round((pi / (PROFILE_POINTS - 1)) * 389);
    const [r, g, b] = sampleRamp(returnToT(day.at(minute).index));
    // Deepen toward a glaze — the ember shader re-lights it from within.
    colors[i * 3] = Math.pow(r * 0.82, 1.25);
    colors[i * 3 + 1] = Math.pow(g * 0.82, 1.25);
    colors[i * 3 + 2] = Math.pow(b * 0.82, 1.25);
    bandIds[i] = pi / (PROFILE_POINTS - 1); // ember shimmer phase per band
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aFacet', new THREE.BufferAttribute(bandIds, 1));
  geo.computeVertexNormals();
  return geo;
}

export function DayStone(): React.JSX.Element | null {
  const act = useWeather((s) => s.act);
  const seed = useWeather((s) => s.seed);
  const reducedMotion = useWeather((s) => s.reducedMotion);
  const size = useThree((s) => s.size);
  const day = dayFor(seed);
  // Wide screens: the stone owns the left half beside the panel. Narrow:
  // it floats above the centered panel.
  const narrow = size.width / Math.max(1, size.height) < 1.05;
  const basePos: [number, number, number] = narrow ? [0, 2.05, 0] : [-1.5, 0.1, 0];
  const scale = narrow ? 0.68 : 1.15;

  const geometry = useMemo(() => buildVesselGeometry(day), [day]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const material = useMemo(() => {
    // Stormy days cut rougher stones (classifier's absolute vol reference).
    const peak = Math.min(1.2, classifyDay(day).peakVol);
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: false, // turned surface — the silhouette carries the form
      metalness: 0.22,
      roughness: 0.58 - 0.26 * Math.min(1, peak),
      emissive: new THREE.Color('#11131F'),
      emissiveIntensity: 0.14,
    });
    // Shader extension (onBeforeCompile): keep the PBR base, inject two
    // authored terms —
    //   facet ember : each facet's ramp color smolders from within, scaled by
    //                 the day's realized vol (stormy stones smolder harder;
    //                 same channels as the facet itself, D-016)
    //   fresnel rim : paper-tinted silhouette catch-light (presentation
    //                 lighting, like the rim lamp beside it)
    // The shimmer runs on the virtual clock and freezes under reduced motion.
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 7 };
      shader.uniforms.uGlow = { value: 0.2 + 0.35 * Math.min(1, peak) };
      shader.uniforms.uRimColor = {
        value: new THREE.Color('#F2EEE4').multiplyScalar(0.28),
      };
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute float aFacet;\nvarying float vFacet;',
        )
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFacet = aFacet;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uTime;\nuniform float uGlow;\nuniform vec3 uRimColor;\nvarying float vFacet;',
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
  // facet ember — the day glowing inside its own stone
  float shimmer = 0.78 + 0.22 * sin(uTime * 0.9 + vFacet * 41.0);
  totalEmissiveRadiance += pow(vColor.rgb, vec3(1.4)) * uGlow * shimmer;
  // fresnel rim — silhouette catch-light in paper
  float fres = pow(1.0 - saturate(dot(normalize(vViewPosition), normal)), 3.0);
  totalEmissiveRadiance += uRimColor * fres;`,
        );
      mat.userData.shader = shader;
    };
    return mat;
  }, [day]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ scene }) => {
    const stone = scene.getObjectByName('day-stone');
    if (!stone) return;
    const shader = (material.userData as { shader?: { uniforms: Record<string, { value: number }> } }).shader;
    if (shader?.uniforms.uTime) {
      // Frozen pose under reduced motion — the ember holds its breath too.
      shader.uniforms.uTime.value = reducedMotion ? 7 : virtualNow() / 1000;
    }
    if (reducedMotion) {
      stone.rotation.set(-0.14, 0.65, 0.05);
      stone.position.set(basePos[0], basePos[1], basePos[2]);
      return;
    }
    // Virtual-clocked: captures can step through the turn deterministically.
    const t = virtualNow() / 1000;
    stone.rotation.x = -0.16 + Math.sin(t * 0.45) * 0.06;
    stone.rotation.y = t * 0.24;
    stone.rotation.z = Math.sin(t * 0.32) * 0.08;
    stone.position.set(basePos[0], basePos[1] + Math.sin(t * 0.8) * 0.06, basePos[2]);
  });

  if (act !== 'review') return null;

  return (
    <group>
      {/* Lights live with the stone so the field pays nothing for them. */}
      <hemisphereLight args={["#F2EEE4", "#0B0C14", 0.28]} />
      <directionalLight position={[3.4, 4.2, 4.8]} intensity={0.75} color="#FFF4E2" />
      <directionalLight position={[-4.2, 1.2, -2.8]} intensity={1.1} color="#7A86E8" />
      <mesh
        name="day-stone"
        geometry={geometry}
        material={material}
        position={basePos}
        scale={scale}
        renderOrder={1}
      />
    </group>
  );
}
