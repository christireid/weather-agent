/** Fullscreen sky gradient with faint per-region temperature air (see SKY_FRAG). */
import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { dayFor, useWeather } from '../state/store';
import { channelsAt } from '../state/engineBridge';
import { currentView } from './camera';
import { buildLayout } from './layout';
import { SKY_FRAG } from './particles/shaders';

const SKY_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.999, 1.0);
}
`;

export function Sky(): React.JSX.Element {
  const seed = useWeather((s) => s.seed);
  const layout = useMemo(() => buildLayout(seed), [seed]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uSectorA: { value: Array.from({ length: 11 }, () => new THREE.Vector4()) },
          uPoints: {
            value: layout.points.map((p) => new THREE.Vector2(p.x, p.y)),
          },
          uView: { value: new THREE.Vector3(1, 0.5, 0.5) },
        },
      }),
    [layout],
  );

  useFrame(() => {
    const s = useWeather.getState();
    const ch = channelsAt(dayFor(s.seed), s.minute);
    const A = material.uniforms.uSectorA?.value as THREE.Vector4[];
    for (let i = 0; i < 11; i++) {
      A[i]?.set(ch.a[i * 4] ?? 0, ch.a[i * 4 + 1] ?? 0, ch.a[i * 4 + 2] ?? 0, ch.a[i * 4 + 3] ?? 0);
    }
    const view = currentView();
    (material.uniforms.uView?.value as THREE.Vector3).set(view.zoom, view.cx, view.cy);
  });

  return (
    <mesh frustumCulled={false} renderOrder={-1}>
      <planeGeometry args={[2, 2]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
