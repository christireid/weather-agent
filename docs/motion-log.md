# Loop C — Motion choreography log

Procedure per spec §1.4: every animated sequence captured as a 12–16 frame
contact sheet via the stepped virtual clock (`scripts/motion.mjs`), critiqued
for easing shape, continuity, duration, and interruptibility. Sheets live in
`docs/screenshots/loop-c/`. Exit: three-plus passes per loop target, final
pass clean.

## title-intro

- **Pass 1 (FAIL):** letters legible only by ~2.4s (spec: gather ends 1.2s)
  and dispersal never dispersed — letters lingered past HUD fade-in. Two
  causes: capture steps >100ms lost sim time to the dt clamp, and dispersal
  relied on the ambient flow, which is far too gentle to clear a wordmark in
  1.8s. Subtitle/hint CSS delays run on wall clock (noted, accepted — they are
  simple fades).
- **Fix:** fixed-step 60Hz substepping for large virtual steps (bounded at 30
  substeps); dispersal gust (`uTitleBurst`, sine bell over the disperse
  phase) that amplifies the field flow so the letters are *blown* back into
  atmosphere; restrained hold glow.
- **Pass 2 (CLEAN):** condensation reads by frame 3 (1.2s), hold with shimmer
  through 3.4s, gust dispersal complete before the HUD staggers in at 5.2s.
  No pops; the letters dissolve into the same weather system that formed them.

## title-skip (interruption)

- **Pass 1 (CLEAN):** skip at 0.8s mid-gather fast-forwards the dispersal in
  400ms — mix ramps down from its skip-time value (no snap), HUD enters, the
  band relaxes into the field. Interruptible from frame 1 as specced.

## scrub-response (100 → 290)

- **Pass 1 (FAIL):** the deterministic re-init lands within one frame ✓, but
  particles teleported — the spec's ≤400ms advection blend was missing.
- **Fix:** pre-scrub position snapshot + per-particle position crossfade
  (smoothstep over 400ms of virtual time) from the old sky into the
  recomputed one. First init exempted (no previous sky).
- **Pass 2 (CLEAN):** the calm sky visibly reorganizes into the squall over
  ~0.4s — dragging weather, not seeking video. Idempotency preserved (blend
  is display-only; sim state is the hash-seeded warm-up).

## focus-open

- **Pass 1 (CLEAN, one note):** camera flight eases in with the long-tail
  spring, focused region's vortex organizes, non-focused sectors recede to
  22% alpha, panel slides on its spring. Note logged: panel figures cramped —
  fixed in the Stage 4 typography pass (smaller dd, nowrap, shorter volume
  figure).

## focus-interrupt (reversal mid-flight)

- **Pass 1 (CLEAN):** release at the flight's midpoint retargets the spring
  smoothly back to full view; dimming lifts, vortex unwinds, panel slides
  out. No orphaned elements, no pops.

## regime-transition (2:16 → 2:32)

- **Pass 1 (FAIL):** the shock arrived as a single-frame pop, and the
  post-shock field went nearly black.
- **Fix A:** `uStormEmphasis` — an authored window derived from the engine's
  scheduled shock (rise over ~8 simulated minutes, exponential 22-minute
  decay) feeding extra turbulence gain and a density/brightness pulse scaled
  by each sector's volatility, so the emphasis belongs to the storm's sectors.
- **Pass 2 (FAIL):** onset improved; post-shock dead-black remained — the
  shock minute's volume spike owned the linear normalization, squashing the
  rest of the day's density.
- **Fix B:** √-compression of the volume→density mapping (monotone, same
  channel; documented in decisions log).
- **Pass 3 (CLEAN):** visible agitation building 2:18–2:19, the sky breaks at
  2:20 (amber surge, blue mass), then a sustained brooding squall that decays
  over the following simulated half hour. Color temperature falls with the
  affected sectors' returns; density pulses ride the volume channel.

## boring-toggle

- **Pass 1 (FAIL):** the settle choreography ran on wall clock (rAF/CSS), so
  the stepped capture couldn't see it — frame 1 was already the full heatmap.
  Determinism violation for captures, too.
- **Fix:** `boring.mix` advanced by virtual-clock dt; the DOM heatmap fade and
  canvas dim both derive from the same mix (BoringChoreo), thresholded so the
  order is settle → heatmap up → canvas out, mirrored on the way back. Deep
  links straight into `?mode=boring` skip the choreography.
- **Pass 2 (CLEAN):** the atmosphere sweeps into a stream, files into 11 rows
  over the ghosted grid, and the chart solidifies as the particles hand over.
  The reverse plays symmetrically. The argument is visible: the spectacle
  *becomes* the chart.

Exit criteria met: every sequence at a clean final pass; interruption sheets
(title-skip, focus-interrupt) verified reversal without breakage.
