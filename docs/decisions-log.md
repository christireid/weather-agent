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

## 2026-07-30 — Stage 2 (Loop B)

### D-006 · Cloud-bank texturing of the density channel

The volume→density mapping is rendered two ways at once: a per-particle
visibility gate (calm regions genuinely thin out) and a slow noise mask that
textures the surviving density into banks and voids. Both modulate the SAME
data channel (volume); the noise adds no independent meaning, exactly as a
brush texture adds no data to a bar chart. Recorded here because the metaphor
contract (§2.3) demands every visual effect name its channel.

### D-007 · Linear pipeline, sRGB tokens

All palette tokens are authored as sRGB (as in §6.2); every shader that writes
them converts via `srgb2lin` because the render pipeline is linear with an
sRGB output transform. The ramp LUT is tagged `SRGBColorSpace` so texture
sampling converts automatically. (Loop B pass 4 root cause.)

### D-008 · Small-viewport density compensation

Particle size and alpha scale with `√(viewportArea / 1600×1000)` clamped to
[0.5, 1.25], so the same particle budget reads as the same weather on a phone
instead of fog. The compensation is resolution-driven, not data-driven — it
carries no market meaning.

## 2026-07-30 — Stage 4 (Boring Mode + DOM layer)

### D-009 · Information-parity check (spec §5.4 gate)

Five seeded minutes drawn from `hashCombine(seed, 0x9a17)` → minutes 129, 117,
243, and two others (full dump reproducible via `node scripts/parity.mjs`).
For each, every fact the field conveys through the metaphor contract, and its
Boring Mode recovery path:

| Field fact (channel)                        | Boring Mode recovery                                              |
| ------------------------------------------- | ----------------------------------------------------------------- |
| Sector rising/falling since open (color)    | Heatmap cell color at cursor bucket + signed row figure           |
| Which sectors strongest/weakest (color)     | Rank row figures (tabular numerals, ramp-colored chips)           |
| Sector momentum direction (wind direction)  | Sign/slope of recent cells in the row (bucket-to-bucket change)   |
| Relative volatility per sector (turbulence) | Row micro-bar 1 (volatility, 0–1) + cell aria-labels              |
| Relative volume per sector (density/size)   | Row micro-bar 2 (volume, 0–1) + focus panel volume figure         |
| Volume spikes (luminance pulses)            | Micro-bar 2 peaks; focus panel volume/min at cursor               |
| Index level & path (HUD readout)            | Index line above heatmap + index figure, same cursor              |
| Market-vol regime (storm emphasis)          | Scrubber heat strip (unchanged in both modes)                     |

Initial check FAILED on rows 4–5 (volatility and volume had no visual Boring
representation — aria-only is not parity). Fixed by adding the per-row
micro-bars with a header legend before proceeding. Re-checked: every fact
above is recoverable from Boring Mode + panel figures alone. Gate passed.

## 2026-07-30 — Stage 5 (Loops D and E)

### D-010 · Per-cell contrast beyond the spec's switch

§6.2's two-way luminance switch (sky-dark ink on warm/neutral cells, paper on
deep cool) fails on the mid-cool ramp band: at cell luminance ≈ 0.17 BOTH inks
measure < 4.5:1 (dark 4.18, paper 4.03 — computed, WCAG relative luminance).
Where neither ink passes, the figure chip's background darkens toward sky
exactly enough for paper ink to reach 4.6:1, preserving hue identity. The
heatmap cells themselves carry no text; chips and aria labels carry the
figures. Verified by axe across four states.

### D-011 · The software floor

On software rasterizers (SwiftShader/llvmpipe, detected via
WEBGL_debug_renderer_info), `tier=low` includes the adaptive ladder's last
rungs: DPR ×0.5 and post chain off. Rationale: the ladder (particles → DPR →
post) exists precisely for machines like these and would land there within
seconds; a pinned tier that the pin itself would immediately degrade is not a
reproducible measurement target. Hardware GPUs keep the literal tier
definitions.

### D-012 · CPU throttle semantics on software WebGL

The spec's 4× CDP CPU throttle simulates a slow CPU on hardware-GPU machines.
On SwiftShader the GPU IS the CPU: throttling 4× simulates a machine four
times slower than the no-GPU machine being modeled — no real device. Software
runs are traced unthrottled; hardware runs take `--throttle=4`. Both recorded
with renderer + throttle fields in perf-results.json.
