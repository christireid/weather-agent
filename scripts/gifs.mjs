// README media: capture deterministic frame sequences via the stepped virtual
// clock and encode them as GIFs (pure-JS: pngjs decode + gifenc quantize —
// the Playwright ffmpeg build has no GIF muxer).
// Usage: node scripts/gifs.mjs [--seq=title,storm,toggle,focus]
import { mkdirSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import gifenc from 'gifenc';

const { GIFEncoder, quantize, applyPalette } = gifenc;
import { launch, serveDist, waitForScene } from './lib/harness.mjs';

const OUT = 'docs/media';
// Default output width; dense stroke sequences override it downward — a
// full-frame wind field is high-entropy and GIF pays for every pixel.
const WIDTH = 880;
mkdirSync(OUT, { recursive: true });

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.replace(/^--/, '').split('=')),
);

/**
 * All sequences capture at the HIGH tier (200k wind strokes — the hero look;
 * clock-stepped captures don't care about SwiftShader frame cost).
 * `endHoldMs` gives the loop a breath on its final frame instead of a
 * jump-cut; `holds` marks extra dwell frames mid-sequence.
 */
const SEQUENCES = {
  title: {
    params: { act: 'title' },
    frames: 64,
    stepMs: 115,
    fps: 18,
    endHoldMs: 1100,
    waitGlyphs: true,
  },
  storm: {
    params: { t: 283 },
    frames: 56,
    stepMs: 160,
    fps: 13,
    endHoldMs: 1000,
    // Dense stroke fields are GIF entropy: the low tier reads identically at
    // this size and halves the bytes; the palette carries the quality.
    tier: 'low',
    width: 720,
    setup: async (page) => page.evaluate(() => window.__mw.setPaused(false)),
  },
  toggle: {
    params: { t: 290 },
    frames: 48,
    stepMs: 90,
    fps: 16,
    endHoldMs: 900,
    setup: async (page) => page.evaluate(() => window.__mw.setMode('boring')),
    mid: async (page) => page.evaluate(() => window.__mw.setMode('field')),
    midAt: 0.6,
    // dwell on the settled heatmap before toggling back
    holds: [{ at: 0.55, ms: 900 }],
  },
  focus: {
    params: { t: 290 },
    frames: 46,
    stepMs: 95,
    fps: 16,
    endHoldMs: 900,
    tier: 'low',
    width: 720,
    setup: async (page) => page.evaluate(() => window.__mw.setFocus('technology')),
    mid: async (page) => page.evaluate(() => window.__mw.setFocus(null)),
    midAt: 0.62,
    holds: [{ at: 0.55, ms: 800 }],
  },
  scrub: {
    params: { t: 60 },
    frames: 42,
    stepMs: 100,
    fps: 15,
    endHoldMs: 900,
    tier: 'low',
    width: 720,
    setup: async (page) => page.evaluate(() => window.__mw.setMinute(290)),
    mid: async (page) => page.evaluate(() => window.__mw.setMinute(120)),
    midAt: 0.5,
    holds: [{ at: 0.45, ms: 700 }],
  },
};

const names = (args.seq ?? Object.keys(SEQUENCES).join(',')).split(',');
const { server, base } = await serveDist();
const browser = await launch();
// Capture at each GIF's output size directly — cheapest and sharpest.
let page = null;
let pageWidth = 0;

for (const name of names) {
  const seq = SEQUENCES[name];
  if (!seq) continue;
  const width = seq.width ?? WIDTH;
  if (!page || width !== pageWidth) {
    if (page) await page.close();
    page = await browser.newPage({
      viewport: { width, height: Math.round(width * 0.625) },
      deviceScaleFactor: 1,
    });
    pageWidth = width;
  }
  const p = new URLSearchParams({ capture: '1', tier: seq.tier ?? 'high' });
  if (seq.params.act) p.set('act', seq.params.act);
  if (seq.params.t !== undefined) p.set('t', String(seq.params.t));
  await page.goto(`${base}/?${p.toString()}`);
  await waitForScene(page);
  if (seq.waitGlyphs) {
    await page.waitForFunction(() => window.__mwGlyphsReady === true, null, { timeout: 20000 });
    await page.evaluate(() => window.__mw.nextFrame());
  }
  if (seq.setup) await seq.setup(page);
  await page.evaluate(() => window.__mw.nextFrame());

  const frames = [];
  for (let i = 0; i < seq.frames; i++) {
    if (seq.mid && i === Math.floor(seq.frames * (seq.midAt ?? 0.5))) {
      await seq.mid(page);
      await page.evaluate(() => window.__mw.nextFrame());
    }
    frames.push(await page.screenshot({ type: 'png' }));
    await page.evaluate((ms) => {
      window.__mw.step(ms);
      return window.__mw.nextFrame();
    }, seq.stepMs);
  }

  // Encode with one global 256-color rgb565 palette built from THREE sampled
  // frames (start/mid/late) concatenated, so the whole arc — dark calm,
  // violet squall, gold currents — is represented without per-frame palette
  // flicker.
  const decoded = frames.map((b) => PNG.sync.read(b));
  const first = decoded[0];
  const gif = GIFEncoder();
  const samples = [0.1, 0.5, 0.85].map(
    (f) => decoded[Math.floor(decoded.length * f)] ?? first,
  );
  const sampleBytes = new Uint8Array(samples.reduce((a, p) => a + p.data.length, 0));
  let off = 0;
  for (const p of samples) {
    sampleBytes.set(new Uint8Array(p.data.buffer, 0, p.data.length), off);
    off += p.data.length;
  }
  const palette = quantize(sampleBytes, 256, { format: 'rgb565' });
  const baseDelay = Math.round(1000 / seq.fps);
  for (let i = 0; i < decoded.length; i++) {
    const png = decoded[i];
    const rgba = new Uint8Array(png.data.buffer, 0, png.data.length);
    const index = applyPalette(rgba, palette, 'rgb565');
    let delay = baseDelay;
    for (const h of seq.holds ?? []) {
      if (i === Math.floor(decoded.length * h.at)) delay = h.ms;
    }
    if (i === decoded.length - 1) delay = seq.endHoldMs ?? baseDelay;
    gif.writeFrame(index, png.width, png.height, { palette, delay });
  }
  gif.finish();
  writeFileSync(`${OUT}/${name}.gif`, Buffer.from(gif.bytes()));
  console.log(`gif ${OUT}/${name}.gif (${frames.length} frames, ${(gif.bytes().length / 1048576).toFixed(1)}MB)`);
}

if (page) await page.close();
await browser.close();
server.close();
