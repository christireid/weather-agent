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
  const tier = useWeather((s) => s.tier);
  const softwareGL = useWeather((s) => s.softwareGL);
  // Software rasterizers get the adaptive ladder's floor as their low tier:
  // half resolution and (in Effects) no post chain — the ladder would land
  // there anyway; pinning ?tier=low starts there (decision D-011).
  const softwareFloor = softwareGL && tier === 'low';
  const dpr = Math.max(
    0.35,
    Math.min(
      2,
      (typeof window === 'undefined' ? 1 : window.devicePixelRatio) *
        dprScale *
        (softwareFloor ? 0.5 : 1),
    ),
  );
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
      onCreated={({ gl }) => {
        try {
          const ctx = gl.getContext();
          const info = ctx.getExtension('WEBGL_debug_renderer_info');
          const renderer = info
            ? String(ctx.getParameter(info.UNMASKED_RENDERER_WEBGL))
            : String(ctx.getParameter(ctx.RENDERER));
          if (/swiftshader|llvmpipe|softpipe|software/i.test(renderer)) {
            useWeather.getState().setSoftwareGL(true);
          }
        } catch {
          /* renderer probe is best-effort */
        }
      }}
    >
      <Sky />
      <Particles />
      <Effects />
      <Quality />
      <CaptureBridge />
    </Canvas>
  );
}
