import { lazy, Suspense, useEffect } from 'react';
import { canvasLabel } from '@market-weather/market';
import { dayFor, syncUrl, useWeather } from './state/store';
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
  const minute = useWeather((s) => s.minute);
  const mode = useWeather((s) => s.mode);
  const focus = useWeather((s) => s.focus);
  const tierPinned = useWeather((s) => s.tierPinned);

  useEffect(() => {
    syncUrl();
  }, [seed, minute, mode, focus, tierPinned]);

  const day = dayFor(seed);
  const label = canvasLabel(day, Math.round(minute));

  return (
    <div className="app">
      {hasWebgl && mode === 'field' ? (
        <div className="scene" role="img" aria-label={label}>
          <Suspense fallback={null}>
            <Field />
          </Suspense>
        </div>
      ) : null}
      <footer className="footer">
        <span>
          All data simulated · seed {seed} · built by{' '}
          <a href="https://github.com/christireid/weather-agent">Christi Reid</a>
        </span>
      </footer>
    </div>
  );
}
