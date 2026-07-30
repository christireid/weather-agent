/**
 * Post-processing budget (spec §6.3, ADR-0004) — exactly four effects:
 *  - Bloom: high threshold, subtle intensity; feeds ONLY on luminance pulses
 *    and storm glints (never text — the DOM sits above the canvas).
 *  - Filmic tone mapping: rolls off the additive highlights.
 *  - Grain: fine static noise ≤3% — kills gradient banding on the sky.
 *  - Vignette: ≤12%, focuses the frame.
 * Nothing else ships.
 */
import { Bloom, EffectComposer, Noise, ToneMapping, Vignette } from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode } from 'postprocessing';
import { useWeather } from '../state/store';

export function Effects(): React.JSX.Element | null {
  const postEnabled = useWeather((s) => s.postEnabled);
  const reducedMotion = useWeather((s) => s.reducedMotion);
  const tier = useWeather((s) => s.tier);
  const softwareGL = useWeather((s) => s.softwareGL);
  const captureMode = useWeather((s) => s.captureMode);
  if (!postEnabled) return null;
  // Software rasterizer at LIVE low tier = the adaptive ladder's floor
  // (D-011): the post chain is the single biggest software-rendering cost.
  // Stepped captures keep the full chain.
  if (softwareGL && tier === 'low' && !captureMode) return null;
  // The grain shader animates per frame; under reduced motion the frame must
  // be perfectly still, so that composer variant omits it (banding risk is
  // acceptable on a static image).
  if (reducedMotion) {
    return (
      <EffectComposer multisampling={0}>
        <Bloom intensity={0.55} luminanceThreshold={0.72} luminanceSmoothing={0.18} mipmapBlur />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <Vignette eskil={false} offset={0.18} darkness={0.42} />
      </EffectComposer>
    );
  }
  return (
    <EffectComposer multisampling={0}>
      <Bloom intensity={0.55} luminanceThreshold={0.72} luminanceSmoothing={0.18} mipmapBlur />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette eskil={false} offset={0.18} darkness={0.42} />
      <Noise premultiply blendFunction={BlendFunction.ADD} opacity={0.018} />
    </EffectComposer>
  );
}
