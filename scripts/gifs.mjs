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
const WIDTH = 880;
mkdirSync(OUT, { recursive: true });

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.replace(/^--/, '').split('=')),
);

const SEQUENCES = {
  title: {
    params: { act: 'title' },
    frames: 60,
    stepMs: 120,
    fps: 16,
    waitGlyphs: true,
  },
  storm: {
    params: { t: 284 },
    frames: 56,
    stepMs: 150,
    fps: 14,
    setup: async (page) => page.evaluate(() => window.__mw.setPaused(false)),
  },
  toggle: {
    params: { t: 290 },
    frames: 44,
    stepMs: 90,
    fps: 16,
    setup: async (page) => page.evaluate(() => window.__mw.setMode('boring')),
    mid: async (page) => page.evaluate(() => window.__mw.setMode('field')),
    midAt: 0.62,
  },
  focus: {
    params: { t: 290 },
    frames: 44,
    stepMs: 90,
    fps: 16,
    setup: async (page) => page.evaluate(() => window.__mw.setFocus('technology')),
    mid: async (page) => page.evaluate(() => window.__mw.setFocus(null)),
    midAt: 0.6,
  },
  scrub: {
    params: { t: 60 },
    frames: 40,
    stepMs: 100,
    fps: 14,
    setup: async (page) => page.evaluate(() => window.__mw.setMinute(290)),
    mid: async (page) => page.evaluate(() => window.__mw.setMinute(120)),
    midAt: 0.5,
  },
};

const names = (args.seq ?? Object.keys(SEQUENCES).join(',')).split(',');
const { server, base } = await serveDist();
const browser = await launch();
// Capture at the GIF's output size directly — cheapest and sharpest.
const page = await browser.newPage({
  viewport: { width: WIDTH, height: Math.round(WIDTH * 0.625) },
  deviceScaleFactor: 1,
});

for (const name of names) {
  const seq = SEQUENCES[name];
  if (!seq) continue;
  const p = new URLSearchParams({ capture: '1', tier: 'low' });
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

  // Encode: one global palette from a mid-sequence frame keeps color stable.
  const decoded = frames.map((b) => PNG.sync.read(b));
  const first = decoded[0];
  const gif = GIFEncoder();
  const refFrame = decoded[Math.floor(decoded.length * 0.6)] ?? first;
  const palette = quantize(new Uint8Array(refFrame.data.buffer, 0, refFrame.data.length), 128, {
    format: 'rgb444',
  });
  const delay = Math.round(1000 / seq.fps);
  for (const png of decoded) {
    const rgba = new Uint8Array(png.data.buffer, 0, png.data.length);
    const index = applyPalette(rgba, palette, 'rgb444');
    gif.writeFrame(index, png.width, png.height, { palette, delay });
  }
  gif.finish();
  writeFileSync(`${OUT}/${name}.gif`, Buffer.from(gif.bytes()));
  console.log(`gif ${OUT}/${name}.gif (${frames.length} frames, ${(gif.bytes().length / 1048576).toFixed(1)}MB)`);
}

await browser.close();
server.close();
