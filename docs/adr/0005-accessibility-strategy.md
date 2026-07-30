# ADR-0005 · Accessibility strategy for a canvas-first experience

**Status:** accepted · 2026-07-30

## Context

The centerpiece is a WebGL canvas — inherently opaque to assistive tech. The
spec (Part 9) demands the full experience be operable and *legible* without
sight of the canvas, not merely labeled.

## Decision

Boring Mode is the parity surface, not a bolt-on:

1. **The canvas is never a focus target.** It carries `role="img"` with a
   per-minute `aria-label` from the same narration generator as the aria-live
   region ("Simulated market weather. 2:20 PM — volatility spike…"). Input
   goes through DOM: 11 invisible-but-focusable region buttons over the sky
   (arrow-key traversal, Enter/Escape), the scrubber slider, and the HUD.
2. **One data path.** Boring Mode, the panels and the scene all read the same
   store selectors and the same `MarketDay`. The §5.4 information-parity check
   is recorded in the decisions log; when it failed (volatility/volume had no
   visual DOM representation) the fix went into Boring Mode's rows, not into
   prose.
3. **Computed contrast, not eyeballed.** The heatmap figure chips pick their
   ink per cell by luminance math; where the mid-cool ramp defeats both inks
   (both < 4.5:1), the chip background darkens toward sky until paper passes
   (D-010). Verified by axe across field/boring/focus/review states.
4. **Reduced motion is a first-class mode.** Time does not auto-advance;
   the field is a static re-rendered still per scrub step; the title act is a
   static card; the animated grain is dropped; springs snap. Verified by
   byte-identical consecutive screenshots in Loop D.
5. **No-WebGL fallback = Boring Mode** plus an explanation line, so the
   accessible surface and the fallback are the same artifact and cannot rot
   independently.

## Consequences

- aria-live announcements are throttled (≥4s, category changes only) so a
  scrub never floods the queue.
- The keyboard walk (tab order, sector selection, mode toggle, scrub steps)
  is a scripted Playwright gate in `scripts/a11y.mjs`, run in CI.
