# ADR-0003 · Deterministic engine + URL-addressable state as the capture/testing backbone

**Status:** accepted · 2026-07-30

## Context

Every visual claim in this project is judged from captured frames (spec Part
1). That is only meaningful if any frame can be reproduced: same seed, same
minute, same mode → same pixels (per machine).

## Decision

Three interlocking rules:

1. **One seeded PRNG (mulberry32), fixed draw order.** The engine draws every
   random number from a single stream in one documented order; seed-dependent
   "day character" draws use a separate `hashCombine(seed, tag)` stream so new
   features never shift the canonical day. No `Math.random()` anywhere in
   engine or scene; the adaptive-quality controller is the only wall-clock
   reader and never drives captured content.
2. **An injected virtual clock.** Playback, the title timeline, the storm
   emphasis, scrub crossfades and the Boring settle all derive from
   `virtualNow()`, which advances from rAF deltas in normal use and ONLY via
   `window.__mw.step(ms)` under `?capture=1`. Shader time is a pure function
   of the simulated minute, so a scrub to minute t is idempotent however you
   arrived.
3. **Every state is a URL.** `?seed=&t=&mode=&focus=&tier=&act=` reproduce any
   named scene state; `?tier=` pins the quality tier (adaptive control off)
   so captures and perf runs are comparable run-to-run.

## Consequences

- The capture harness (stills, contact sheets, perf, axe) addresses states
  with zero test-only code paths beyond the `__mw` bridge.
- Particle state is path-dependent during free playback (acceptable); all
  captures and scrubs go through minute-hashed re-init + fixed warm-up, which
  is the reproducible spine.
- "New weather" is shareable by construction (`?seed=`).
