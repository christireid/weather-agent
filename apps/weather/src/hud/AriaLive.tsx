/**
 * Polite narration of meaningful transitions (spec §5): announces when the
 * sky's condition category changes (calm ↔ brisk ↔ stormy, storm sector set
 * changes), throttled so a scrub never floods the queue. Same generator as
 * the canvas label — the screen-reader story always matches the sky.
 */
import { useEffect, useRef, useState } from 'react';
import { describeConditions, STORMY_VOL } from '@market-weather/market';
import { dayFor, useWeather } from '../state/store';

const MIN_GAP_MS = 4000;

export function AriaLive(): React.JSX.Element {
  const seed = useWeather((s) => s.seed);
  const minute = useWeather((s) => s.minute);
  const [message, setMessage] = useState('');
  const lastKey = useRef('');
  const lastAt = useRef(0);

  useEffect(() => {
    const day = dayFor(seed);
    const t = Math.round(minute);
    const m = day.at(t);
    const stormy = m.sectors
      .map((s, i) => (s.volatility > STORMY_VOL ? i : -1))
      .filter((i) => i >= 0)
      .join(',');
    const brisk = m.sectors.filter((s) => s.volatility > 0.45).length >= 3;
    const key = stormy ? `storm:${stormy}` : brisk ? 'brisk' : 'calm';
    const now = performance.now();
    if (key !== lastKey.current && now - lastAt.current > MIN_GAP_MS) {
      lastKey.current = key;
      lastAt.current = now;
      setMessage(describeConditions(day, t));
    }
  }, [seed, minute]);

  return (
    <div aria-live="polite" className="visually-hidden">
      {message}
    </div>
  );
}
