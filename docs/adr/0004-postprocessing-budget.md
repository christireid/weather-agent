# ADR-0004 · Post-processing budget and restraint rules

**Status:** accepted · 2026-07-30

## Context

Spec §6.3 fixes the post chain; anything outside it is "borrowed spectacle."
Each effect must name its purpose.

## Decision

Exactly four effects, in this order:

| Effect | Purpose (named) |
| --- | --- |
| **Bloom** (threshold 0.72, intensity 0.55, mipmap blur) | Feeds ONLY on the honest highlights: volume-spike luminance pulses, storm-sector glints, the title hold glow. Text never blooms (DOM sits above the canvas). |
| **ACES filmic tone mapping** | Rolls off additive-blend highlights so dense storm cores saturate gracefully instead of clipping to white. |
| **Grain** (additive noise, 3% opacity) | Kills banding on the sky gradient — the one visible artifact of a near-black indigo field. Dropped under reduced motion because the shader animates per frame and stillness wins. |
| **Vignette** (offset 0.18, darkness 0.42) | Focuses the frame; measured ≲12% corner attenuation. |

Rejected: chromatic aberration, depth of field, god rays (spec-forbidden;
none has a data channel), MSAA (soft additive sprites don't alias on edges;
the cost is real on SwiftShader).

## Consequences

- The whole chain is one `EffectComposer` with `multisampling={0}`; the
  adaptive controller's last rung disables it entirely on struggling machines.
- Under `prefers-reduced-motion` the composer swaps to a grain-free variant so
  a static frame is bit-stable across time (verified by Loop D).
