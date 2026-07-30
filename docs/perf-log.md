# Loop E — Performance log

Procedure per spec Part 11: capture trace → compare against budget → single
highest-impact fix per iteration → re-trace. Harness: `scripts/perf.mjs`
(CDP throttle for hardware runs, in-page rAF-delta recorder, 20s free-running
Act II + one focus flight, tier pinned via `?tier=`). All traces below on
SwiftShader (software WebGL) — this build machine has no GPU.

## Iteration 0 — baseline (FAIL, catastrophically)

`--throttle=4`, low tier (60k, DPR 1, post on):
**p75 500ms**, 33 frames > 50ms. High tier: p75 783ms.

Diagnosis: the per-pixel/per-vertex 11-site Gaussian sector blend. Sky alone
evaluated 11 `exp()` per pixel (≈18M/frame at 1600×1000); the sim and render
shaders repeated the same loop per particle. On a software rasterizer that
loop was the entire frame.

## Iteration 1 — the air texture (5.0× faster)

Highest-impact fix: bake the blended sector channels
(momentum/vol/volume/tempT) into a 64×64 RGBA texture on the CPU
(`airField.ts`, updated every 0.2 simulated minutes ≈ 3 frames), and replace
every shader-side blend loop with one bilinear fetch. Per-region B channels
(spike/hover/focusDim) stay a uniform array read via the crisp nearest-site
lookup. Visual result verified identical in look-dev captures (the CPU bake
computes the same Gaussian weights).

Result: low tier p75 500 → **100ms**. Still far over. Also defined the
software floor (D-011): on software renderers, `?tier=low` includes the
adaptive ladder's last rungs (DPR ×0.5, post chain off) — the ladder would
land there within seconds anyway, and pinning a tier must not pin a
configuration the pin itself would immediately degrade.

## Iteration 2 — throttle semantics + shader trims

Decision D-012: the 4× CDP CPU throttle models a slow CPU driving a hardware
GPU; applying it to a software rasterizer (the renderer IS the CPU) models no
real device and double-counts the handicap. Software-WebGL runs are traced
unthrottled; hardware-GPU runs use `--throttle=4` as specced. Recorded in
`perf-results.json` per trace.

Shader trims: forward-difference curl (3 ψ evals instead of 4), zero-dt sim
skip when paused, 30Hz sim integration at the software floor (display remains
per-frame; sub-frame advection smoothness is display-bound there anyway).

Result: see `docs/perf/perf-results.json` (final numbers below).

## Final numbers

Filled at Loop E exit — see DELIVERY.md for the trace table and the
adaptive step-down demonstration.
