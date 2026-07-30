/**
 * URL-addressable state (spec §5): ?seed=&t=&mode=&focus=&tier=&capture=.
 * Loading a URL reproduces the exact view; the capture harness addresses
 * scene states this way.
 */

export interface UrlState {
  seed: number;
  minute: number | null;
  mode: 'field' | 'boring' | null;
  focus: string | null;
  tier: 'high' | 'low' | null;
  capture: boolean;
  act: 'title' | 'field' | 'review' | null;
}

export function readUrl(search: string): UrlState {
  const p = new URLSearchParams(search);
  const seedRaw = Number(p.get('seed'));
  const minuteRaw = p.get('t');
  const mode = p.get('mode');
  const tier = p.get('tier');
  const act = p.get('act');
  return {
    seed: Number.isFinite(seedRaw) && seedRaw > 0 ? Math.floor(seedRaw) : 20260729,
    minute: minuteRaw !== null && Number.isFinite(Number(minuteRaw)) ? Number(minuteRaw) : null,
    mode: mode === 'boring' ? 'boring' : mode === 'field' ? 'field' : null,
    focus: p.get('focus'),
    tier: tier === 'high' ? 'high' : tier === 'low' ? 'low' : null,
    capture: p.get('capture') === '1',
    act: act === 'title' || act === 'field' || act === 'review' ? act : null,
  };
}

export function writeUrl(state: {
  seed: number;
  minute: number;
  mode: 'field' | 'boring';
  focus: string | null;
  tierPinned: 'high' | 'low' | null;
}): string {
  const p = new URLSearchParams();
  if (state.seed !== 20260729) p.set('seed', String(state.seed));
  p.set('t', String(Math.round(state.minute)));
  if (state.mode !== 'field') p.set('mode', state.mode);
  if (state.focus) p.set('focus', state.focus);
  if (state.tierPinned) p.set('tier', state.tierPinned);
  return `?${p.toString()}`;
}
