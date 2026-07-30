# ADR-0001 · React Three Fiber + Vite (over vanilla three.js, Next.js, and 2D canvas)

**Status:** accepted · 2026-07-30

## Context

Market Weather is a single full-viewport WebGL scene with a thin DOM layer
(HUD, panels, Boring Mode) that must read the same state as the scene. It
ships as a fully static build, and every visual state must be addressable by
URL for the capture harness.

## Decision

Vite + React + React Three Fiber, TypeScript `strict`.

- **R3F over vanilla three:** the piece is one scene, but it is surrounded by
  a lot of coordinated DOM (scrubber, focus panel, heatmap, help, review). One
  component tree with one store (zustand) means the canvas and the DOM read
  identical selectors — which is precisely what makes the Boring Mode
  information-parity claim checkable. The R3F render loop (`useFrame`) also
  gives a single, disciplined place to enforce frame-loop hygiene. The cost —
  a react-reconciler layer over three — is irrelevant here: the scene graph is
  four nodes; all per-frame work is uniform writes and FBO passes.
- **Vite over Next.js:** there is no route, no server, no ISR — a Next app
  would be a framework tax on a static page. Vite keeps the GLSL toolchain
  trivial and the chunking explicit (the scene is one lazy chunk behind the
  title act).
- **WebGL over 2D canvas (the sibling's medium):** 200k independently-advected
  particles with per-particle color/size at 60fps is out of 2D canvas range by
  two orders of magnitude; the piece's entire thesis (data-driven atmosphere)
  needs GPU simulation.

## Consequences

- React never touches per-frame data: engine channels flow through a memoized
  bridge into uniforms; zustand state changes re-render only the HUD.
- The `three` + R3F + postprocessing scene chunk (~258KB gz) is acceptable
  because it lazy-loads behind the title act, keeping first render at ~76KB
  JS + fonts.
