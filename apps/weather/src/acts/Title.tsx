/**
 * Act I DOM overlay. The headline itself is the particle field (glyph
 * targets); this layer carries only the subtitle and the input affordance.
 * Under reduced motion the particle choreography is replaced by a static
 * title card (spec §7) that waits for input — nothing moves on its own.
 */
import { useWeather } from '../state/store';

export function Title(): React.JSX.Element | null {
  const act = useWeather((s) => s.act);
  const reducedMotion = useWeather((s) => s.reducedMotion);
  if (act !== 'title') return null;
  return (
    <div className="title-overlay">
      {reducedMotion ? <h1 className="title-static">Market Weather</h1> : null}
      <p className="title-subtitle">One simulated trading day, rendered as sky.</p>
      <p className="title-hint">press any key · tap anywhere</p>
    </div>
  );
}
