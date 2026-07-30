/**
 * Act IV — The Day in Review. The field freezes at the close; this panel
 * typesets the day. Replay restarts the same seed; New Weather draws a fresh
 * non-flat seed (visible, shareable via ?seed=).
 */
import { newWeatherSeed } from '@market-weather/market';
import { dayFor, useWeather } from '../state/store';
import { rampCss, returnToT } from '../scene/ramp';

export function Review(): React.JSX.Element | null {
  const act = useWeather((s) => s.act);
  const seed = useWeather((s) => s.seed);
  const s = useWeather.getState();
  if (act !== 'review') return null;
  const day = dayFor(seed);
  const sum = day.summary();
  const pct = (x: number): string => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(2)}%`;

  const replay = (): void => {
    s.setMinute(0, { scrub: true });
    s.setAct('field');
    s.setPaused(false);
  };
  const newWeather = (): void => {
    s.setSeed(newWeatherSeed(seed));
    s.setPaused(false);
  };

  return (
    <section className="review-panel" aria-label="Day in review">
      <h2>The day, in review</h2>
      <dl>
        <div>
          <dt>best sector</dt>
          <dd style={{ color: rampCss(returnToT(sum.bestSector.returnSinceOpen)) }}>
            {sum.bestSector.name} {pct(sum.bestSector.returnSinceOpen)}
          </dd>
        </div>
        <div>
          <dt>worst sector</dt>
          <dd style={{ color: rampCss(returnToT(sum.worstSector.returnSinceOpen)) }}>
            {sum.worstSector.name} {pct(sum.worstSector.returnSinceOpen)}
          </dd>
        </div>
        <div>
          <dt>volatility peak</dt>
          <dd>{sum.volPeakClock}</dd>
        </div>
        <div>
          <dt>index at close</dt>
          <dd style={{ color: rampCss(returnToT(sum.indexClose)) }}>{pct(sum.indexClose)}</dd>
        </div>
        <div>
          <dt>total volume</dt>
          <dd>{(sum.totalVolume / 1000).toFixed(1)}B shares</dd>
        </div>
      </dl>
      <div className="review-actions">
        <button onClick={replay}>replay this day</button>
        <button onClick={newWeather}>new weather</button>
      </div>
      <p className="review-seed">seed {seed} · all figures simulated</p>
    </section>
  );
}
