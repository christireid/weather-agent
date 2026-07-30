# Decisions Log — Market Weather

Running log of judgment calls made while building, per spec Part 1.6.

## 2026-07-30 — Stage 0

### D-001 · WebGL capture harness flags (Stage 0 gate)

Headless Chromium renders WebGL2 via software rasterization with:

```
--use-angle=swiftshader --enable-unsafe-swiftshader
```

Verified by `scripts/prove-harness.mjs`: a raw-WebGL2 triangle (palette colors on
`#0B0C14` sky) rendered and captured to `docs/screenshots/harness/triangle-swiftshader.png`,
visually inspected — crisp edges, correct interpolated colors, no black canvas.
`--use-gl=angle --use-angle=swiftshader-webgl` also works; the shorter set is canonical.
Reported renderer string: `WebKit WebGL / WebGL 2.0 (OpenGL ES 3.0 Chromium)`.

### D-002 · Browser executable pinning

The environment pre-installs Playwright build `chromium-1194` at `/opt/pw-browsers`
while the installed Playwright npm version expects a newer build. Per environment
guidance, all harness scripts launch with `executablePath: '/opt/pw-browsers/chromium'`
instead of downloading browsers. Recorded here so CI config mirrors it (CI uses
`npx playwright install chromium` when the pinned path is absent).

## 2026-07-30 — Stage 1 (Loop A)

### D-003 · Absolute vol reference for the archetype classifier

Renderer channels normalize against the day's own maximum (spec §4.1), which makes
"peak normalized vol < 0.35" meaningless day-to-day. The classifier therefore rescales
against `REFERENCE_PEAK_VOL = 0.0026` — the canonical day's measured raw peak sector
vol, pinned as a constant. "Peak normalized vol" in §4.4 reads as "relative to the
canonical storm."

### D-004 · GARCH constants and shock feedback damping

First-pass constants (B=0.10, C=0.87, undamped impulse feedback into market vol²)
let post-shock sector feedback loops out-spike the storm itself: the day's vol peak
landed at 14:28 in a single sector, hijacking the shared normalization denominator
(only 2 stormy sectors at "peak"). Tuned to B=0.06, C=0.88 (echo half-life ≈ 11 min)
and damped the impulse's entry into the market GARCH to λ=0.25 (sector echo already
comes from each sector's own b·shock² term). Result: peak at 14:22, 4 sectors ≥ 0.85
normalized vol, clean decaying envelope. Constants tuned, tests untouched (per §4.5).

### D-005 · Day character from a separate hashed stream

Flat/choppy archetypes need seed-varied day character (base-vol multiplier 0.55–1.4×,
and 3–4 alternating-sign market gusts on ~45% of no-shock days). These draw from
`createRng(hashCombine(seed, 0xda71))` — a stream separate from the main one — so
adding character draws never shifted the canonical day's realization. Census over
seeds 1–200: 1 flat / 39 calm-drift / 120 one-storm / 40 choppy.

### Loop A exit evidence

- 66 tests passing (minimum 45), three consecutive identical green runs.
- Mutation spot-check: inverting the volatility-clustering feedback sign
  (`+B·shock²` → `−B·shock²`) failed 33/66 tests; reverted, suite green again.
