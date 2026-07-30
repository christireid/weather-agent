// Loop C capture: frame sequences of every animated sequence, laid out as
// contact sheets (spec §1.4). Frames advance ONLY via the stepped virtual
// clock, so sheets are reproducible per machine.
// Usage: node scripts/motion.mjs [--seq=title-intro,focus-open] [--out=docs/screenshots/loop-c]
import { mkdirSync, writeFileSync } from 'node:fs';
import { CAPTURE_SIZES, launch, serveDist, waitForScene } from './lib/harness.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.replace(/^--/, '').split('=')),
);

/**
 * Each sequence: initial URL params, optional setup actions, then `frames`
 * captures separated by `stepMs` of virtual time. `mid` runs halfway through
 * (for interruption/reversal tests).
 */
const SEQUENCES = {
  'title-intro': {
    params: { act: 'title' },
    frames: 16,
    stepMs: 400,
    waitGlyphs: true,
  },
  'title-skip': {
    params: { act: 'title' },
    frames: 12,
    stepMs: 100,
    waitGlyphs: true,
    setup: async (page) => {
      // Let the gather begin, then skip mid-flight — must fast-forward, not pop.
      await page.evaluate(() => window.__mw.step(800));
      await page.evaluate(() => window.__mw.nextFrame());
      await page.keyboard.press('Space');
    },
  },
  'scrub-response': {
    params: { t: 100 },
    frames: 12,
    stepMs: 80,
    setup: async (page) => {
      await page.evaluate(() => window.__mw.setMinute(290));
    },
  },
  'focus-open': {
    params: { t: 290 },
    frames: 16,
    stepMs: 120,
    setup: async (page) => {
      await page.evaluate(() => window.__mw.setFocus('technology'));
    },
  },
  'focus-interrupt': {
    params: { t: 290 },
    frames: 16,
    stepMs: 120,
    setup: async (page) => {
      await page.evaluate(() => window.__mw.setFocus('technology'));
    },
    mid: async (page) => {
      // Reverse mid-flight: release while the camera is still traveling.
      await page.evaluate(() => window.__mw.setFocus(null));
    },
  },
  'regime-transition': {
    params: { t: 286 },
    frames: 16,
    stepMs: 250,
    setup: async (page) => {
      await page.evaluate(() => window.__mw.setPaused(false));
    },
  },
  'boring-toggle': {
    params: { t: 290 },
    frames: 14,
    stepMs: 120,
    setup: async (page) => {
      await page.evaluate(() => window.__mw.setMode('boring'));
    },
  },
};

const names = (args.seq ?? Object.keys(SEQUENCES).join(',')).split(',');
const out = args.out ?? 'docs/screenshots/loop-c';
mkdirSync(out, { recursive: true });

const { server, base } = await serveDist();
const browser = await launch();
const page = await browser.newPage({ viewport: CAPTURE_SIZES.desktop, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error(`[pageerror] ${e.message}`));

for (const name of names) {
  const seq = SEQUENCES[name];
  if (!seq) {
    console.error(`unknown sequence ${name}`);
    continue;
  }
  const p = new URLSearchParams({ capture: '1', tier: 'low', ...(seq.params.act ? { act: seq.params.act } : {}), });
  if (seq.params.t !== undefined) p.set('t', String(seq.params.t));
  await page.goto(`${base}/?${p.toString()}`);
  await waitForScene(page);
  if (seq.waitGlyphs) {
    await page.waitForFunction(() => window.__mwGlyphsReady === true, null, { timeout: 20000 });
    await page.evaluate(() => window.__mw.nextFrame());
  }
  if (seq.setup) await seq.setup(page);
  await page.evaluate(() => window.__mw.nextFrame());

  const shots = [];
  for (let i = 0; i < seq.frames; i++) {
    if (seq.mid && i === Math.floor(seq.frames / 2)) await seq.mid(page);
    shots.push(await page.screenshot({ type: 'jpeg', quality: 70 }));
    await page.evaluate((ms) => {
      window.__mw.step(ms);
      return window.__mw.nextFrame();
    }, seq.stepMs);
  }

  // Compose the contact sheet in a fresh page (no external tools needed).
  const sheet = await browser.newPage({ viewport: { width: 1720, height: 10 } });
  const imgs = shots
    .map(
      (b, i) =>
        `<figure><img src="data:image/jpeg;base64,${b.toString('base64')}"><figcaption>${i} · +${((i * seq.stepMs) / 1000).toFixed(2)}s</figcaption></figure>`,
    )
    .join('');
  await sheet.setContent(
    `<style>body{margin:0;background:#111;display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:6px;font:10px monospace;color:#aaa}img{width:100%;display:block}figure{margin:0}figcaption{padding:2px}</style>${imgs}`,
  );
  const buf = await sheet.screenshot({ fullPage: true });
  writeFileSync(`${out}/${name}-sheet.png`, buf);
  await sheet.close();
  console.log(`sheet ${out}/${name}-sheet.png (${seq.frames} frames @ ${seq.stepMs}ms)`);
}

await browser.close();
server.close();
