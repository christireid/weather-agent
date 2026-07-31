# Loop B — Look-dev critique log

Procedure per spec §1.3: implement → capture stills (open 9:30 / calm 10:45 /
storm 14:20 / close 16:00, 1600×1000 @1x + 390×844 @1x, tiers pinned via
`?tier=`) → written critique → fix → re-capture. Exit after ≥3 passes on the
first pass with zero new findings. All captures under `docs/screenshots/loop-b/`.

## Pass 1 — hard Voronoi shards (FAIL)

- Composition: none — the frame is a flat wall of dust. No value structure.
- Palette: ramp hues present but washed to pastel; sky reads mid-grey, not
  `#0B0C14` indigo.
- Artifact: region boundaries are razor-sharp polygon edges with bright
  accumulation seams — the hard argmin sector lookup makes the flow field
  discontinuous, so particles pile into boundary ribbons. Reads as glass
  shards, not weather. Legibility of channel data: momentum/vol illegible.

**Fixes:** replace hard lookup with Gaussian inverse-distance blending of all
11 sector channels (continuous flow, regions dissolve at edges); cut particle
alpha ~4×; quiet the sky tint.

## Pass 2 — soft bands, comet streaks (FAIL)

- Bands now read as weather; storm region has energy. Two artifacts: bright
  comet-streak ribbons (particles converging onto streamlines of the
  quasi-static warm-up flow) and a still-milky overall wash. Top band
  transition too sharp.

**Fixes:** per-step diffusion jitter; warm-up noise time marches at full rate
(decorrelates the field); blend sigma 0.11 → 0.13; darker sky tint.

## Pass 3 — calm is invisible (FAIL)

- Streaks gone. But `field-calm` shows an almost empty frame — volume-scaled
  alpha makes calm regions vanish entirely — and the whole image still sits in
  grey fog rather than luminous-on-dark.

**Fixes:** depth-driven size spread (far dust 1–2px, near soft orbs 6–9px),
alpha floor raised, color deepened, sky tint reduced.

## Pass 4 — the sRGB/linear bug (FAIL, root cause found)

- Calm frame showed a *mid-slate* sky with almost no particles — proof the
  background lift was never particle wash: the sky shader wrote sRGB token
  values into the linear pipeline, which the output transform re-encoded,
  lifting `#0B0C14` to slate. Fixed by converting palette constants to linear
  in-shader (`srgb2lin`). Removed the compensating `pow` darkening from the
  sprite shader.

## Pass 5 — dark sky lands; density made literal (PROGRESS)

- Sky finally near-black; storm frame gains true dynamic range (amber river,
  blue-violet squall, dark voids). New decision: density is now *literal* —
  a per-particle gate thins calm regions (volume channel), and a slow noise
  mask textures that same density into cloud banks (one channel, spatially
  textured; logged in decisions-log D-006).

## Pass 6 — calm over-corrected (FAIL)

- Calm now a void; legibility criterion ("name the strong/weak sectors from
  the still") fails at 10:45. Vignette corners crushing to pure black.

**Fixes:** alpha floor 0.085 → 0.115, gate floor 0.30 → 0.48, cloud floor
0.18 → 0.30, vignette darkness 0.62 → 0.42.

## Pass 7 — desktop lands; mobile fogs (FAIL on mobile only)

- Desktop: storm poster-worthy — layered depth (dust → mid grains → near
  orbs), luminous amber current lower-left, cool storm core, honest negative
  space. Calm reads as a quiet morning with one warm sector standing out —
  truthful to the data. Close shows the recovered/mixed field. No banding
  (grain working), no aliasing shimmer at rest, no clipped highlights except
  intentional bloom cores.
- Mobile: 200k particles into 390×844 = oversaturated fog. Point size/alpha
  did not account for viewport area.

**Fix:** screen-area compensation on point size and alpha (`screenFactor =
clamp(√(area/1.6M), 0.5, 1.25)`).

## Pass 8 — clean (EXIT)

- All four timestamps × both tiers × both sizes inspected. Mobile now reads
  as the same weather, denser but legible. Low tier (60k, larger sprites)
  holds the composition. Value structure: foreground orbs / midground grain /
  background dust + sky gradient. Palette: ramp + sky tokens only. Legibility:
  storm → 4 stormy sectors nameable by region; calm → strong sector nameable;
  channels trace per the metaphor contract. No new findings. Reference bar:
  the storm still stands next to good codrops particle work; the field-calm
  is intentionally quiet (a design choice, not a defect — calm mornings are
  the foil for the squall).

Exit criteria met: 8 passes total, ≥3 minimum, final pass zero new findings.

## Redesign round — "not generic enough" (reopened Loop B)

Direction critique accepted: soft round sprites in colored bands is the default
particle-demo look. Three passes to a distinctive hand:

### Pass 9 — wind strokes (PROGRESS, new fail mode)

Replaced round sprites with velocity-aligned capsule strokes: each particle is
drawn along its own wind+turbulence vector, length ∝ local speed, comet-shaded
so the bright head shows direction of travel in a STILL (momentum legibility
up). Finding: the frame became woven fabric — strokes everywhere, negative
space gone, night sky lost.

### Pass 10 — restore the dark (PROGRESS)

Stronger alpha compensation (∝ 1/(1+0.9·stretch)), deeper cloud-void floor,
shorter strokes. Storm keeps the combed texture, calm returns to quiet grain —
but the texture is FUR: the curl octaves are texel-frequency, so strokes
disagree with their neighbors and no large-scale form emerges.

### Pass 11 — coherent currents (EXIT for the redesign)

The real fix was in the FLOW, not the sprite: dominant eddy frequency dropped
~2× (storm adds energy, not frequency; per-particle noise-phase decorrelation
reduced), cloud banks enlarged. Result: the storm core now forms a breaking
wave — a luminous crest curling over the front line, streaming currents,
honest voids — and the calm morning reads as slow drift. The picture has
composition-scale structure that is entirely advected data. Verified: title
glyphs and boring-grid formations damp strokes back to crisp grains
(uStreakDamp), so choreography is unharmed.

### Pass 12 — the day stone (Act IV object moment)

Added the review act's single strong 3D object (D-015). Pass 12a: face-normal
displacement at ±0.3 tore the icosahedron into floating shards — debris, not
a stone. Pass 12b: displacement reduced to hairline cleavage (±0.08) with a 6%
facet inset — closed silhouette, crack lines catching the violet rim light,
amber winner-facets against the neutral flats of a near-flat close. Desktop:
stone left, summary right; narrow screens float it above the panel. Verified
across tiers/sizes; smoke and axe re-run green (×2).

### Pass 13 — the day, turned (geometry pass)

The icosahedron's f%11 facet mapping was the object's weakest link —
decoration, not derivation. Replaced with the lathe-of-the-index (D-017):
the vessel's silhouette IS the day's chart, revolved. 13a: flat-shaded lathe
rows read as stacked cream bowls — switched to smooth shading, deepened the
glaze, strengthened the choke (radius 0.44–1.06). 13b: white speckle over the
glaze traced to transparent-pass wind strokes drawing over the opaque vessel —
atmosphere moved to far-plane depth with depth testing; grain 3% → 1.8%.
Result: turned porcelain wearing the day — amber morning swell, ribbed
midday, the 2:20 choke, pale flat close. Storm/field states verified
unaffected.

### Pass 14 — chroma (the palette carries the piece)

Direction critique: "more eye-catching." The V-luminance ramp had fixed the
*structure* (D-018) but the colors themselves were still polite — a pale tan
gold and a muted ultramarine. Three coupled fixes (D-019):

- **Seven stops, wider arc** — violet → indigo → azure → slate → ember →
  amber → gold, chroma climbing steeply toward both extremes.
- **Hue-preserving accumulation** — the additive pass was bleaching the
  densest (= biggest-moving) regions toward white. Saturation and glow now
  scale with distance-from-neutral, so movers burn in their own hue.
- **Bloom + voids retuned** — threshold 0.72→0.58 / intensity 0.55→0.85 so
  cores bleed light; cloud floor 0.10→0.04 and threshold 0.14→0.22 so real
  night survives between the currents.

Findings from the re-capture: the brighter field broke paper-text contrast
over gold regions (HUD figures, footer, legend chip) — fixed with top/bottom
gradient scrims and an opaque legend chip (D-020), not by dimming the art.
Result: the storm reads as aurora over a night sky, the 10:45 calm as a true
nocturne, and the heatmap's 2:20 break as a hard violet column. Verified
across both tiers and sizes; axe clean; smoke green.

### GIF pipeline (README media)

Encoding was tuned for safety, not for the work: low tier, 128-color rgb444,
jump-cut loops. Now: title/toggle capture at the HIGH tier (200k strokes —
captures are clock-stepped, so SwiftShader cost is irrelevant); a 256-color
**rgb565** palette quantized from three sampled frames (start/mid/late) so the
whole arc is represented without per-frame flicker; per-frame delays with a
~1s hold on the final frame and mid-sequence dwells at the moments that
deserve them. Dense stroke sequences render at 720px to keep GIF entropy
(and README weight) sane — 21.9 MB total across five.
