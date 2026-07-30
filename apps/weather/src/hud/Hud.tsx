/**
 * The instrument strip (Act II): virtual clock, index readout, tier glyph,
 * pause state, Boring Mode toggle. Elements carry .hud-el for the 60ms
 * staggered fade-in after the title act.
 */
import { clockLabel } from '@market-weather/market';
import { dayFor, useWeather } from '../state/store';
import { rampCss, returnToT } from '../scene/ramp';

export function Hud(): React.JSX.Element | null {
  const act = useWeather((s) => s.act);
  const seed = useWeather((s) => s.seed);
  const minute = useWeather((s) => Math.round(s.minute));
  const paused = useWeather((s) => s.paused);
  const tier = useWeather((s) => s.tier);
  const mode = useWeather((s) => s.mode);
  const helpOpen = useWeather((s) => s.helpOpen);
  const st = useWeather.getState();

  if (act === 'title') return null;
  const day = dayFor(seed);
  const m = day.at(Math.round(minute));
  const pct = `${m.index >= 0 ? '+' : '−'}${Math.abs(m.index * 100).toFixed(2)}%`;

  return (
    <header className="hud">
      <div className="hud-el hud-brand">
        <span className="hud-title">Market Weather</span>
        <span className="hud-sub">simulated</span>
      </div>
      <div className="hud-el hud-clock" aria-live="off">
        <span className="hud-time">{clockLabel(Math.round(minute))}</span>
        <span className="hud-index" style={{ color: rampCss(returnToT(m.index)) }}>
          index {pct}
        </span>
      </div>
      <div className="hud-el hud-controls">
        <button
          onClick={() => st.setPaused(!paused)}
          aria-label={paused ? 'Resume time' : 'Pause time'}
          aria-pressed={paused}
        >
          {paused ? '▶' : '⏸'}
        </button>
        <button
          onClick={() => st.setMode(mode === 'field' ? 'boring' : 'field')}
          aria-pressed={mode === 'boring'}
          className="hud-boring"
        >
          Boring Mode
        </button>
        <button
          onClick={() => st.setHelpOpen(!helpOpen)}
          aria-label="Keyboard shortcuts"
          aria-expanded={helpOpen}
        >
          ?
        </button>
        <span className="hud-tier" title={`quality tier: ${tier}`} aria-label={`quality tier ${tier}`}>
          {tier === 'high' ? '◆' : '◇'}
        </span>
      </div>
    </header>
  );
}

export function HelpSheet(): React.JSX.Element | null {
  const helpOpen = useWeather((s) => s.helpOpen);
  const st = useWeather.getState();
  if (!helpOpen) return null;
  return (
    <div className="help-sheet" role="dialog" aria-label="Keyboard shortcuts">
      <h3>Keyboard</h3>
      <dl>
        <div><dt>Tab</dt><dd>move between controls and sky regions</dd></div>
        <div><dt>Enter</dt><dd>focus the selected sector</dd></div>
        <div><dt>Esc</dt><dd>release focus / close panels</dd></div>
        <div><dt>← →</dt><dd>scrubber: step 5 minutes (shift: 30)</dd></div>
        <div><dt>Space</dt><dd>pause / resume</dd></div>
        <div><dt>B</dt><dd>Boring Mode</dd></div>
        <div><dt>R</dt><dd>replay the day</dd></div>
      </dl>
      <h3>Quality</h3>
      <p>
        Tier adapts to frame time (◆ high · ◇ low). Pin it with <code>?tier=high</code> or{' '}
        <code>?tier=low</code>.
      </p>
      <button onClick={() => st.setHelpOpen(false)}>close</button>
    </div>
  );
}
