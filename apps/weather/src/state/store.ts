/**
 * The one small UI store (spec Part 8). Engine MarketDay is immutable and
 * memoized per seed; the R3F scene, HUD, panels and Boring Mode all read
 * through the same selectors — that is what makes information parity checkable.
 */
import { create } from 'zustand';
import { simulateDay, type MarketDay } from '@market-weather/market';
import { readUrl, writeUrl } from './url';

export type Mode = 'field' | 'boring';
export type Tier = 'high' | 'low';
export type Act = 'title' | 'field' | 'review';

const dayCache = new Map<number, MarketDay>();
export function dayFor(seed: number): MarketDay {
  let day = dayCache.get(seed);
  if (!day) {
    day = simulateDay(seed);
    dayCache.set(seed, day);
    if (dayCache.size > 8) {
      const first = dayCache.keys().next().value;
      if (first !== undefined && first !== seed) dayCache.delete(first);
    }
  }
  return day;
}

const initial = readUrl(typeof window === 'undefined' ? '' : window.location.search);

export const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface WeatherState {
  seed: number;
  minute: number; // fractional simulated minute 0..389
  mode: Mode;
  focus: string | null; // sector slug
  act: Act;
  paused: boolean;
  tier: Tier;
  tierPinned: Tier | null;
  postEnabled: boolean;
  dprScale: number; // adaptive DPR knob (1 = full)
  captureMode: boolean;
  reducedMotion: boolean;
  helpOpen: boolean;
  // actions
  setMinute(minute: number, opts?: { scrub?: boolean }): void;
  setMode(mode: Mode): void;
  setFocus(focus: string | null): void;
  setAct(act: Act): void;
  setPaused(paused: boolean): void;
  setTier(tier: Tier): void;
  setPost(enabled: boolean): void;
  setDprScale(s: number): void;
  setSeed(seed: number): void;
  setHelpOpen(open: boolean): void;
  /** Bumped on every scrub/jump so the particle sim knows to re-init. */
  scrubGeneration: number;
}

export const useWeather = create<WeatherState>((set) => ({
  seed: initial.seed,
  minute: initial.minute ?? 0,
  mode: initial.mode ?? 'field',
  focus: initial.focus,
  // Deep links (?t= or ?mode=) bypass the title act entirely (spec Part 14).
  act:
    initial.act ??
    (initial.minute !== null || initial.mode !== null || initial.focus !== null
      ? 'field'
      : 'title'),
  paused: initial.capture, // captures never free-run
  tier: initial.tier ?? 'high',
  tierPinned: initial.tier,
  postEnabled: true,
  dprScale: 1,
  captureMode: initial.capture,
  reducedMotion: prefersReducedMotion,
  helpOpen: false,
  scrubGeneration: 0,

  setMinute: (minute, opts) =>
    set((s) => ({
      minute: Math.max(0, Math.min(389, minute)),
      scrubGeneration: opts?.scrub ? s.scrubGeneration + 1 : s.scrubGeneration,
      act: s.act === 'review' && minute < 389 ? 'field' : s.act,
    })),
  setMode: (mode) => set({ mode }),
  setFocus: (focus) => set({ focus }),
  setAct: (act) => set({ act }),
  setPaused: (paused) => set({ paused }),
  setTier: (tier) => set({ tier }),
  setPost: (postEnabled) => set({ postEnabled }),
  setDprScale: (dprScale) => set({ dprScale }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  setSeed: (seed) =>
    set((s) => ({
      seed,
      minute: 0,
      focus: null,
      act: 'field',
      scrubGeneration: s.scrubGeneration + 1,
    })),
}));

/** Serialize the addressable slice back to the URL (throttled by caller). */
let urlTimer: ReturnType<typeof setTimeout> | null = null;
export function syncUrl(): void {
  if (typeof window === 'undefined') return;
  if (urlTimer) return;
  urlTimer = setTimeout(() => {
    urlTimer = null;
    const s = useWeather.getState();
    if (s.captureMode) return; // captures own their URL
    window.history.replaceState(
      null,
      '',
      writeUrl({
        seed: s.seed,
        minute: s.minute,
        mode: s.mode,
        focus: s.focus,
        tierPinned: s.tierPinned,
      }),
    );
  }, 500);
}
