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
