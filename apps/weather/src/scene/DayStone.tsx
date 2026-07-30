/**
 * Act IV — the day stone. When the market closes, the whole day condenses
 * into one faceted object (the skill-recipe "one strong 3D object" moment):
 *
 *   facet displacement  ← that sector's |return since open| at the close
 *   facet color         ← the same return through the OKLab temperature ramp
 *   surface roughness   ← the day's realized vol (vs the canonical reference):
 *                          stormy days cut rougher stones
 *   rotation / bob      ← presentation transform only (virtual-clocked,
 *                          still under prefers-reduced-motion)
 *
 * Real geometry (displaced icosahedron, flat-shaded), PBR material, perspective
 * camera, key + hemisphere + rim lights. Every attribute names its channel
 * (D-015) — a different stone for every seed.
 */
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { classifyDay, type MarketDay } from '@market-weather/market';
import { dayFor, useWeather } from '../state/store';
import { virtualNow } from '../state/clock';
import { sampleRamp, returnToT } from './ramp';

function buildStoneGeometry(day: MarketDay): THREE.BufferGeometry {
  const base = new THREE.IcosahedronGeometry(1, 1).toNonIndexed();
  const pos = base.getAttribute('position');
  const faceCount = pos.count / 3;
  const colors = new Float32Array(pos.count * 3);
  const close = day.at(389);

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();

  const centroid = new THREE.Vector3();
  for (let f = 0; f < faceCount; f++) {
    const sector = f % 11;
    const ret = close.sectors[sector]?.returnSinceOpen ?? 0;
    // Displacement is hairline cleavage, not shrapnel: winners' facets sit a
    // breath proud, losers' a breath deep — the crack lines catch the rim
    // light and read as cut mineral.
    const disp = Math.max(-0.05, Math.min(0.08, ret * 2.6));
    a.fromBufferAttribute(pos, f * 3);
    b.fromBufferAttribute(pos, f * 3 + 1);
    c.fromBufferAttribute(pos, f * 3 + 2);
    centroid.copy(a).add(b).add(c).divideScalar(3);
    n.copy(centroid).normalize().multiplyScalar(disp);
    for (let v = 0; v < 3; v++) {
      const i = f * 3 + v;
      // Slight inset toward the facet centroid keeps the silhouette closed.
      const px = pos.getX(i) + (centroid.x - pos.getX(i)) * 0.06 + n.x;
      const py = pos.getY(i) + (centroid.y - pos.getY(i)) * 0.06 + n.y;
      const pz = pos.getZ(i) + (centroid.z - pos.getZ(i)) * 0.06 + n.z;
      pos.setXYZ(i, px, py, pz);
    }
    const [r, g, bl] = sampleRamp(returnToT(ret));
    for (let v = 0; v < 3; v++) {
      colors[(f * 3 + v) * 3] = r;
      colors[(f * 3 + v) * 3 + 1] = g;
      colors[(f * 3 + v) * 3 + 2] = bl;
    }
  }
  base.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  base.computeVertexNormals();
  return base;
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
  const scale = narrow ? 0.72 : 1.35;

  const geometry = useMemo(() => buildStoneGeometry(day), [day]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const material = useMemo(() => {
    // Stormy days cut rougher stones (classifier's absolute vol reference).
    const peak = Math.min(1.2, classifyDay(day).peakVol);
    return new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      metalness: 0.22,
      roughness: 0.58 - 0.26 * Math.min(1, peak),
      emissive: new THREE.Color('#11131F'),
      emissiveIntensity: 0.14,
    });
  }, [day]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ scene }) => {
    const stone = scene.getObjectByName('day-stone');
    if (!stone) return;
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
      <hemisphereLight args={['#F2EEE4', '#0B0C14', 0.55]} />
      <directionalLight position={[3.4, 4.2, 4.8]} intensity={1.35} color="#FFF4E2" />
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
