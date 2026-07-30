# ADR-0002 · GPU particle simulation: FBO ping-pong (over transform feedback)

**Status:** accepted · 2026-07-30

## Context

The atmosphere is 200k (high tier) / 60k (low tier) particles advected through
a curl-noise flow field driven by per-sector engine channels (spec Part 7).
Two standard WebGL2 approaches: transform feedback on vertex buffers, or
positions in float textures updated by fragment-shader passes (FBO ping-pong).

## Decision

FBO ping-pong: positions live in a `side×side` RGBA float texture pair
(448² ≈ 200k / 245² ≈ 60k); each step renders a fullscreen quad through the
advection shader into the other target; the render pass reads positions by
vertex-texture-fetch.

Reasons:

1. **The scrub contract (§3.2) is texture-shaped.** Deterministic re-init is
   "write `hash(seed, minute)` into every texel" — one fullscreen pass with
   the init shader, then 90 warm-up steps. With transform feedback this means
   re-uploading or ping-ponging large vertex buffers and losing the trivially
   parallel hash-write.
2. **The ≤400ms scrub crossfade needs the previous state as a random-access
   snapshot** — a texture copy is one blit; the render shader then blends
   old→new positions per particle. TF buffers cannot be sampled in the vertex
   shader on WebGL2 without extra copies anyway.
3. **SwiftShader friendliness.** The capture/CI pipeline runs on software
   WebGL; fragment passes over a 448² target are the best-supported path
   (`EXT_color_buffer_float` renders; no reliance on TF corner cases).

## Consequences

- Simulation cost is resolution-bound and tier-controlled; warm-up (90 steps)
  runs only on scrub/jump, and large clock steps substep at 60Hz with a
  bounded cap (30) so choreography never loses time to a dt clamp.
- Velocity is not stored: advection is stateless through the divergence-free
  curl field plus a small diffusion jitter, which keeps the state one texture
  and makes re-init exact.
