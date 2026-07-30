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
  if (!postEnabled) return null;
  return (
    <EffectComposer multisampling={0}>
      <Bloom intensity={0.55} luminanceThreshold={0.72} luminanceSmoothing={0.18} mipmapBlur />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette eskil={false} offset={0.18} darkness={0.42} />
      <Noise premultiply blendFunction={BlendFunction.ADD} opacity={0.03} />
    </EffectComposer>
  );
}
