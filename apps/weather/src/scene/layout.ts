/**
 * Sector sky regions (spec §2.4): a Voronoi partition of the viewport from 11
 * seed points on a jittered 4×3 grid (one cell unused), x-jitter 3× y-jitter,
 * with a vertically-compressed distance metric so regions read as wide,
 * layered weather bands. Stable across the day; derived only from the seed.
 *
 * The same points + metric are used by the GLSL sector lookup and by the DOM
 * overlay (polygons via half-plane clipping), so pointer, keyboard and shader
 * all agree about where a sector lives.
 */
import { createRng, hashCombine } from '@market-weather/market';

export interface SectorLayout {
  /** 11 points in unit space [0,1]² (y up in GL, y down for DOM consumers — see toDomPolygon). */
  points: { x: number; y: number }[];
  /** Region polygons in unit space, index-aligned with points. */
  polygons: { x: number; y: number }[][];
}

/** Vertical compression of the distance metric: boundaries prefer running horizontally. */
export const METRIC_Y_SCALE = 2.2;

export function buildLayout(seed: number): SectorLayout {
  const rng = createRng(hashCombine(seed, 0x1a70));
  // 4 cols × 3 rows = 12 cells; drop one interior cell chosen from the seed.
  const dropped = rng.int(12);
  const points: { x: number; y: number }[] = [];
  const xJitter = 0.16; // of full width — 3× the y jitter
  const yJitter = xJitter / 3;
  for (let cell = 0; cell < 12; cell++) {
    // Draw jitter for every cell (fixed draw count), skip the dropped one.
    const jx = rng.range(-xJitter, xJitter);
    const jy = rng.range(-yJitter, yJitter);
    if (cell === dropped) continue;
    const col = cell % 4;
    const row = Math.floor(cell / 4);
    points.push({
      x: (col + 0.5) / 4 + jx,
      y: (row + 0.5) / 3 + jy,
    });
  }

  // Anisotropic Voronoi = ordinary Voronoi in metric-scaled space.
  const scaled = points.map((p) => ({ x: p.x, y: p.y * METRIC_Y_SCALE }));
  const polygons = scaled.map((site, i) => {
    // Start from the scaled bounding rect, clip by each bisector half-plane.
    let poly: { x: number; y: number }[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: METRIC_Y_SCALE },
      { x: 0, y: METRIC_Y_SCALE },
    ];
    scaled.forEach((other, j) => {
      if (i === j || poly.length === 0) return;
      // Half-plane of points closer to `site` than `other`:
      // (p − mid)·(other − site) ≤ 0.
      const mid = { x: (site.x + other.x) / 2, y: (site.y + other.y) / 2 };
      const n = { x: other.x - site.x, y: other.y - site.y };
      poly = clipHalfPlane(poly, mid, n);
    });
    // Back to unit space.
    return poly.map((p) => ({ x: p.x, y: p.y / METRIC_Y_SCALE }));
  });

  return { points, polygons };
}

function clipHalfPlane(
  poly: { x: number; y: number }[],
  mid: { x: number; y: number },
  n: { x: number; y: number },
): { x: number; y: number }[] {
  const inside = (p: { x: number; y: number }): boolean =>
    (p.x - mid.x) * n.x + (p.y - mid.y) * n.y <= 0;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (!a || !b) continue;
    const ia = inside(a);
    const ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) {
      const da = (a.x - mid.x) * n.x + (a.y - mid.y) * n.y;
      const db = (b.x - mid.x) * n.x + (b.y - mid.y) * n.y;
      const t = da / (da - db);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

/** Which sector contains a unit-space point (same metric as the shader). */
export function sectorAt(layout: SectorLayout, x: number, y: number): number {
  let best = 0;
  let bestD = Infinity;
  layout.points.forEach((p, i) => {
    const dx = x - p.x;
    const dy = (y - p.y) * METRIC_Y_SCALE;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Flat [x0,y0, x1,y1, …] of the 11 sites for shader uniforms. */
export function pointsToUniform(layout: SectorLayout): Float32Array {
  const arr = new Float32Array(22);
  layout.points.forEach((p, i) => {
    arr[i * 2] = p.x;
    arr[i * 2 + 1] = p.y;
  });
  return arr;
}
