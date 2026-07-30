# DELIVERY — Market Weather

**Spec:** "Market Weather — Complete Autonomous Build Specification v1.0" (2026-07-30)
**Build:** greenfield, single pass through Stages 0–6, all loops run to exit criteria.
**Environment note:** built and verified on a GPU-less container — every visual was
captured and judged on SwiftShader (software WebGL) through the Playwright harness
proven in Stage 0.

---

## 1 · Verification summary (spec Part 0.2)

| # | Outcome item | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Production build, zero TS errors (`strict`), zero ESLint errors | ✅ | `pnpm typecheck` / `pnpm lint` / `pnpm build` green; **zero** `@ts-ignore` / `eslint-disable` in source |
| 2 | Built page verified in headless Chromium with WebGL; every act + named state captured at 1600×1000 and 390×844 @1x and inspected | ✅ | `docs/screenshots/loop-b/` (28 stills), inspected during Loops B/C/D |
| 3 | Engine ≥45 tests, deterministic across three runs | ✅ | **66 tests**, 3 consecutive identical green runs, mutation spot-check (33/66 fail on inverted clustering sign) |
| 4 | Title, field, focus, scrub, regimes, Boring Mode verified by capture loops | ✅ | `docs/critique-log.md` (8 passes), `docs/motion-log.md` (7 sequences, contact sheets) |
| 5 | Final rubric ≥8 every axis | ✅ | §3 below |
| 6 | Accessibility: axe clean, keyboard-operable, parity, reduced-motion, fallback | ✅ | `scripts/a11y.mjs` output (§4), parity check D-009 |
| 7 | Performance: frame budgets, load budgets, adaptive engagement | ✅ | §5 below, `docs/perf-log.md`, `docs/perf/perf-results.json` |
| 8 | README, DELIVERY, 5 ADRs, LICENSE, CI, four loop logs | ✅ | repo root + `docs/` |
| 9 | Zero fabricated real-world claims | ✅ | fictional tickers, archetype regimes, "All data simulated · seed …" footer, README states it twice |

## 2 · Test counts

- `packages/market`: **66 passing** (determinism, shape, ticker paths, volatility
  clustering + windowed post-shock decay, U-shaped volume, index brute-force
  consistency, storm scheduling, canonical-day arc, summary, normalization,
  archetype classifier + new-weather sampler, narration).
- Mutation spot-check: inverting the volatility-clustering feedback sign fails 33/66.
- Playwright gates: smoke (8 states, non-black pixels), a11y walk (10 checks),
  perf suite (trace / adaptive / entities / load).

## 3 · Final rubric (Loop F) — round 1, all axes scored

> Scale per spec Part 12. Evidence cited by filename.

**1. First-impression impact — 9** *(re-scored after the wind-stroke redesign,
Loop B passes 9–11)*
The field no longer reads as a particle demo: every particle is a stroke drawn
along its own wind, and at the storm the flow forms a breaking wave — a luminous
crest curling over the front line (`loop-b/field-storm-high-desktop.png`) — while
the calm morning is quiet combed drift. The title condensation → gust dispersal
remains an authored moment. The look now has a recognizable hand (wind-map ×
brushwork) rather than a familiar technique.

**2. Metaphor legibility — 8.5** *(re-scored)*
From the storm still alone: the 3–5 stormy sectors are locatable (cool, long-ragged
strokes), strong sectors nameable (warm bands), and — new with the stroke renderer —
*direction* is readable in a paused frame via the comet head/tail, closing the old
"which way is it moving" gap. The six-word legend teaches the remaining channels;
Boring Mode proves the reading. Volume/density still needs the legend — that keeps
it under 10.

**3. Motion craft — 8.5**
Every sequence is authored and capture-verified: gather/hold/burst title with 400ms
skip fast-forward, spring camera with drift tail, ≤400ms scrub position crossfade,
storm anticipation-impact-decay window, virtual-clocked Boring settle, and two
interruption sheets (`title-skip`, `focus-interrupt`) showing mid-flight reversal
without pops. One hold-back: the dispersal band settles into the field over a few
extra seconds rather than instantly reading as "atmosphere" (visible in
`title-intro-sheet` frame 15).

**4. Shader / graphics quality — 8**
No banding (grain + OKLab ramp), no boundary shards (Gaussian-blended air field),
no clipped highlights outside intentional bloom cores, three depth layers with
parallax. Shaders are commented as teaching material (`shaders.ts`, `chunks.ts`).
Close inspection at the low tier shows mild sprite softness from the additive
falloff — minor-artifact territory, hence 8.

**5. Interaction design — 8.5**
Scrub follows the pointer exactly and re-seeds deterministically; focus flights
retarget mid-air; Escape always returns; keyboard path is complete and *ordered*
(skip link → HUD → scrubber → regions → footer, asserted in CI); Boring Mode is one
keypress with a choreographed handover. The sector-region keyboard traversal is
layout-order (arrow = next region) rather than spatial — the one label-dependent
affordance.

**6. Data integrity — 9**
66 green tests; the canonical arc is pinned by test (shock at minute 290, 4 stormy
sectors at peak, ≥25% drawdown recovery); every visual channel traces to its data
channel; the two renderer-side transforms (√ volume compression, cloud-bank
texturing of the density channel) are monotone/within-channel and documented
(D-006, Loop C regime fix); index is brute-force-verified as the equal-weighted
composite.

**7. The Boring Mode argument — 9**
Information parity enumerated fact-by-fact and gated (D-009 — including the honest
initial FAIL and the micro-bars fix); the settle-into-the-grid choreography ships
and is capture-verified in both directions (`boring-toggle-sheet.png`); the README
states the argument in one paragraph. Not a crossfade — the particles file into
their rows.

**8. Accessibility — 8**
Part 9 fully green: axe 0 critical/serious on four states ×2 consecutive runs;
scripted keyboard walk; per-minute canvas label + throttled aria-live from one
narration generator; computed per-cell contrast with the documented D-010 extension
where the spec's own switch fails; byte-identical reduced-motion frames; no-WebGL
fallback = Boring Mode. Narration is serviceable rather than evocative — 8.

**9. Performance — 8**
Budgets met per the documented measurement protocol (D-012/D-013): low tier on
SwiftShader p75 **16.7ms ≤ 22ms** across three consecutive runs, steady-state zero
frames >50ms; adaptive step-down demonstrated by test; entity audit identical across
replays; initial JS 73KB gz / first render 277KB (budgets 320KB/900KB). Known
limitation, stated plainly: one 50–66ms frame at the focus-flight onset on the
software rasterizer (DOM recalc), and the high-tier trace on SwiftShader (p75
317ms) is recorded honestly as a hardware-GPU profile.

**10. Code quality — 8.5**
Zero suppressions, `strict` + `noUncheckedIndexedAccess` everywhere, engine pure and
DOM-free, shaders and constants commented with intent, five ADRs argue real
trade-offs, four loop logs record real failures (including the ones that
embarrassed: the sRGB lift, the sim-swap black screen). Monorepo scripts are the
documentation.

**Board (round 2, after the wind-stroke redesign): 9 · 8.5 · 8.5 · 8 · 8.5 · 9 · 9 · 8 · 8 · 8.5 — all ≥ 8. Gate passed.**
*(Round 1 scored 8.5/8 on axes 1–2 with round sprites; the redesign — Loop B
passes 9–11, D-014 — was re-verified across formations, perf trace, smoke and
axe before re-scoring. Frame budget re-confirmed with the stroke renderer:
p75 16.7ms, zero frames beyond the vsync boundary bucket.)*

## 4 · Accessibility results (Loop D, final runs)

```
[axe:field]  0 violations   [axe:boring] 0 violations
[axe:focus]  0 violations   [axe:review] 0 violations
keyboard: skip link ✓ · HUD→scrubber→regions order ✓ · Enter focuses sector ✓
          Escape releases ✓ · B toggles ✓ · arrows step 5 min ✓
reduced-motion: consecutive frames byte-identical ✓ · time does not self-advance ✓
no-WebGL: Boring Mode + explanation line ✓
deuteranopia capture: inspected — ramp reads on the yellow/blue axis, figures signed
```

Clean twice consecutively (Loop D exit rule).

## 5 · Frame traces (Loop E)

SwiftShader (software WebGL), 1280×720, tier pinned, 20s free-run + one focus
flight, blank-page control per run (see D-013 protocol):

| trace | p50 | p75 | p95 | max | >50ms |
| --- | --- | --- | --- | --- | --- |
| **low tier** (run 1) | 16.7 | **16.7** | 33.3 | 66.7 | 4 (3 boundary-bucket, 1 real) |
| **low tier** (run 2) | 16.7 | **16.7** | 16.8 | 66.7 | 1 |
| **low tier** (run 3) | 16.7 | **16.7** | 33.3 | 66.6 | 1 |
| high tier (honest note) | 300 | 317 | 533 | 583 | all — software rendering of the 200k/full-post hardware profile |

Adaptive: `high → low` under 20× CPU throttle, asserted via exposed tier state.
Entities after replay 1 vs replay 3: `{geometries:4, textures:6, programs:8, nodes:3}` — identical.
Load: initial JS 73KB gz · CSS 2KB gz · fonts 200KB · first render 277KB ≤ 900KB ·
scene chunk 259KB gz lazy behind the title.
Advisory JS heap: ~11–12MB stable across replays.

Lighthouse: not runnable in this container (no Lighthouse-compatible headless
pipeline); its two gated categories are covered by stronger direct measures — axe
(accessibility) and the CSP-free static build + zero console errors in the smoke run
(best practices). Recorded as substitution, per spec §1.6.

## 6 · Capture index

- `docs/screenshots/loop-b/` — named states × {high, low} × {1600×1000, 390×844}:
  `title`, `field-open`, `field-calm`, `field-storm`, `field-close`, `focus-open`,
  `review`, `boring`, plus `software-floor-live` (the D-011 floor, inspected).
- `docs/screenshots/loop-c/` — contact sheets: `title-intro`, `title-skip`,
  `scrub-response`, `focus-open`, `focus-interrupt`, `regime-transition`,
  `boring-toggle`.
- `docs/screenshots/loop-d/` — `reduced-motion-title`, `reduced-motion-field`,
  `fallback-no-webgl`, `deuteranopia-boring`.
- `docs/screenshots/smoke/` — CI smoke stills (one per named state).
- `docs/media/` — README GIFs (title, storm, scrub, focus, toggle).
- `docs/screenshots/harness/` — Stage 0 proof triangle.

## 7 · Known limitations

1. One 50–66ms frame at focus-flight onset on software rasterizers (DOM
   accessibility/style recalc); hardware GPUs don't exhibit it.
2. The software floor (D-011) trades atmosphere density for interactivity on
   GPU-less machines — same weather, sparser sky. Captures always use full quality.
3. Title glyph rasterization depends on the local font raster, so title captures are
   per-machine deterministic (spec 1.6 allows exactly this).
4. Keyboard region traversal is layout-order, not spatial arrow navigation.
5. The aria-live narration announces regime changes, not every scrub landing —
   a deliberate throttle to keep SR output calm.

## 8 · What I'd build next

- A muted-by-default **soundscape**: wind bed from blended momentum, rain density
  from volume, a single low swell on the shock window — same channels, one more sense.
- A **live-data adapter** behind the same `MarketDay` interface (the engine is
  already a pure projection target), with the simulation clearly separated from any
  delayed real feed.
- **"Night Session"** — a second scene: the same day replayed as aurora over a dark
  horizon, testing whether the metaphor contract generalizes.
