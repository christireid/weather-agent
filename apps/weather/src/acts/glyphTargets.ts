/**
 * Title-act glyph targets (spec §7): rasterize "MARKET WEATHER" in the display
 * face to an offscreen canvas, sample covered pixels, and pack one target per
 * particle into a float texture. The particles themselves condense into the
 * letters — the type is made of atmosphere, not laid over it.
 */
import * as THREE from 'three';

const TITLE = 'MARKET WEATHER';

/** Field-space box the title occupies (centered, wide). */
const BOX = { cx: 0.5, cy: 0.54, width: 0.86 };

export async function buildGlyphTargets(side: number): Promise<THREE.DataTexture> {
  // Ensure the display face is ready before rasterizing.
  try {
    await document.fonts.load('500 200px "Newsreader Variable"');
  } catch {
    // Fall back to serif silently — capture determinism is per-machine.
  }

  const W = 2048;
  const H = 512;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2d context unavailable');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff';
  ctx.font = '500 200px "Newsreader Variable", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '6px';
  ctx.fillText(TITLE, W / 2, H / 2);

  const img = ctx.getImageData(0, 0, W, H).data;
  const pts: number[] = [];
  // Stride 2 keeps the sample list dense enough for 200k particles while
  // scanning only ~260k pixels.
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      if ((img[(y * W + x) * 4] ?? 0) > 128) {
        pts.push(x / W, 1 - y / H);
      }
    }
  }
  const count = pts.length / 2;
  if (count === 0) throw new Error('glyph raster produced no coverage');

  const aspectFix = (H / W) * (1600 / 1000); // keep letterforms round on the default canvas
  const data = new Float32Array(side * side * 4);
  // A large co-prime stride decorrelates particle index from glyph position,
  // so the gather reads as condensation, not a wipe.
  const PRIME = 104729;
  for (let i = 0; i < side * side; i++) {
    const j = (i * PRIME) % count;
    const gx = pts[j * 2] ?? 0.5;
    const gy = pts[j * 2 + 1] ?? 0.5;
    data[i * 4] = BOX.cx + (gx - 0.5) * BOX.width;
    data[i * 4 + 1] = BOX.cy + (gy - 0.5) * BOX.width * aspectFix;
    data[i * 4 + 2] = (i % 997) / 997; // shimmer phase
    data[i * 4 + 3] = 1;
  }
  const tex = new THREE.DataTexture(data, side, side, THREE.RGBAFormat, THREE.FloatType);
  tex.needsUpdate = true;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}
