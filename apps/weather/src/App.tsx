import { lazy, Suspense, useEffect, useState } from 'react';
import { canvasLabel } from '@market-weather/market';
import { dayFor, syncUrl, useWeather } from './state/store';
import { Title } from './acts/Title';
import { Review } from './acts/Review';
import { Hud, HelpSheet } from './hud/Hud';
import { Scrubber } from './hud/Scrubber';
import { FocusPanel } from './hud/FocusPanel';
import { Interactions } from './hud/Interactions';
import { SectorOverlay } from './hud/SectorOverlay';
import { Legend } from './hud/Legend';
import { AriaLive } from './hud/AriaLive';
import { Boring } from './boring/Boring';
import { BoringChoreo } from './boring/BoringChoreo';
import '@fontsource-variable/newsreader';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';

const Field = lazy(() => import('./scene/Field'));

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return c.getContext('webgl2') !== null;
  } catch {
    return false;
  }
}

const hasWebgl = typeof window !== 'undefined' && webglAvailable();

export function App(): React.JSX.Element {
  const seed = useWeather((s) => s.seed);
  const minute = useWeather((s) => Math.round(s.minute));
  const mode = useWeather((s) => s.mode);
  const focus = useWeather((s) => s.focus);
  const act = useWeather((s) => s.act);
  const tierPinned = useWeather((s) => s.tierPinned);
  // Keep the Boring layer mounted once visited so the reverse choreography
  // (heatmap fades out, atmosphere un-files) has a surface to run on.
  const [everBoring, setEverBoring] = useState(mode === 'boring');

  // URL sync happens on user actions (scrub release, toggles, seed change) —
  // never on the auto-advancing clock: history.replaceState can stall a
  // frame, and free playback must stay allocation- and jank-free (Loop E).
  useEffect(() => {
    if (mode === 'boring') setEverBoring(true);
    syncUrl();
  }, [seed, mode, focus, tierPinned]);

  // Software compositors pay dearly for backdrop-filter surfaces (Loop E:
  // a 216ms allocation stall + per-frame blur). The panels drop translucency
  // there via this class.
  const softwareGL = useWeather((s) => s.softwareGL);
  useEffect(() => {
    document.body.classList.toggle('software-gl', softwareGL);
  }, [softwareGL]);

  const day = dayFor(seed);
  const label = canvasLabel(day, Math.round(minute));

  return (
    <main className="app">
      <a className="skip-link" href="#hud-controls">
        Skip to controls
      </a>
      {hasWebgl ? (
        <div className="scene" role="img" aria-label={label}>
          <Suspense fallback={null}>
            <Field />
          </Suspense>
        </div>
      ) : null}
      {mode === 'boring' || everBoring || !hasWebgl ? (
        <div className="boring-wrap" style={hasWebgl ? { opacity: 0 } : undefined}>
          {!hasWebgl ? (
            <p className="fallback-note">
              WebGL is unavailable here — this is the same simulated day as a readable chart.
              The full atmospheric version needs WebGL2.
            </p>
          ) : null}
          <Boring />
          {hasWebgl ? <BoringChoreo /> : null}
        </div>
      ) : null}
      <Title />
      <Hud />
      <HelpSheet />
      <FocusPanel />
      <Review />
      {act !== 'title' ? (
        <div className="dock" id="hud-controls">
          <Scrubber />
        </div>
      ) : null}
      {/* After the dock in DOM order: tab flows HUD → scrubber → regions (§5). */}
      <SectorOverlay />
      <Legend />
      <Interactions />
      <AriaLive />
      <footer className="footer">
        <span>
          All data simulated · seed {seed} · built by{' '}
          <a href="https://github.com/christireid/weather-agent">Christi Reid</a>
        </span>
      </footer>
    </main>
  );
}
