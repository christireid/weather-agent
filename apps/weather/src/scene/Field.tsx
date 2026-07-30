/**
 * The WebGL field scene — lazy-loaded behind the title act so the initial JS
 * chunk stays within the load budget (spec Part 10).
 */
import { Canvas } from '@react-three/fiber';
import { Sky } from './Sky';
import { Particles } from './Particles';
import { Effects } from './Effects';
import { Quality } from './Quality';
import { CaptureBridge } from '../capture/CaptureBridge';
import { useWeather } from '../state/store';

export default function Field(): React.JSX.Element {
  const dprScale = useWeather((s) => s.dprScale);
  const dpr = Math.max(0.5, Math.min(2, (typeof window === 'undefined' ? 1 : window.devicePixelRatio) * dprScale));
  return (
    <Canvas
      // The canvas is a non-interactive picture; the DOM overlay owns input.
      // Its aria-label lives on the wrapper (role="img") in the app shell.
      gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
      dpr={dpr}
      flat
      frameloop="always"
      style={{ position: 'absolute', inset: 0 }}
      aria-hidden="true"
    >
      <Sky />
      <Particles />
      <Effects />
      <Quality />
      <CaptureBridge />
    </Canvas>
  );
}
