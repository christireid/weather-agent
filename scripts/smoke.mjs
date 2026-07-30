// CI smoke test (spec Part 8): load the built page headless with software
// WebGL, assert the canvas produces non-black pixels, capture one still per
// named state.
import { mkdirSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { CAPTURE_SIZES, launch, serveDist, settle, waitForScene } from './lib/harness.mjs';

const OUT = 'docs/screenshots/smoke';
mkdirSync(OUT, { recursive: true });

const STATES = {
  title: { act: 'title' },
  'field-open': { t: 0 },
  'field-calm': { t: 75 },
  'field-storm': { t: 290 },
  'field-close': { t: 389 },
  'focus-open': { t: 290, focus: 'technology' },
  review: { act: 'review', t: 389 },
  boring: { t: 290, mode: 'boring' },
};

const { server, base } = await serveDist();
const browser = await launch();
const page = await browser.newPage({ viewport: CAPTURE_SIZES.desktop, deviceScaleFactor: 1 });
let failures = 0;
page.on('pageerror', (e) => {
  failures++;
  console.error(`[pageerror] ${e.message}`);
});

for (const [name, st] of Object.entries(STATES)) {
  const p = new URLSearchParams({ capture: '1', tier: 'low' });
  if (st.t !== undefined) p.set('t', String(st.t));
  if (st.mode) p.set('mode', st.mode);
  if (st.focus) p.set('focus', st.focus);
  if (st.act) p.set('act', st.act);
  await page.goto(`${base}/?${p.toString()}`);
  await waitForScene(page);
  if (st.act === 'title') {
    await page
      .waitForFunction(() => window.__mwGlyphsReady === true, null, { timeout: 20000 })
      .catch(() => {});
    await page.evaluate(() => {
      window.__mw.step(2000);
      return window.__mw.nextFrame();
    });
  }
  await settle(page, 3);

  // Non-black assertion on the actual composited pixels (readPixels on the
  // live canvas returns zeros without preserveDrawingBuffer).
  const shot = await page.screenshot({ path: `${OUT}/${name}.png` });
  if (st.mode !== 'boring') {
    const png = PNG.sync.read(shot);
    let sum = 0;
    let n = 0;
    // sample the central region, skipping HUD/dock bands
    for (let y = Math.floor(png.height * 0.25); y < png.height * 0.75; y += 4) {
      for (let x = Math.floor(png.width * 0.1); x < png.width * 0.9; x += 4) {
        const i = (y * png.width + x) * 4;
        sum += ((png.data[i] ?? 0) + (png.data[i + 1] ?? 0) + (png.data[i + 2] ?? 0)) / 3;
        n++;
      }
    }
    const lit = sum / n;
    const ok = lit > 2;
    if (!ok) {
      failures++;
      console.error(`[smoke] ✗ ${name}: mean brightness ${lit.toFixed(2)}`);
    } else {
      console.log(`[smoke] ✓ ${name} (mean brightness: ${lit.toFixed(1)})`);
    }
  } else {
    const cells = await page.evaluate(() => document.querySelectorAll('.boring-cell').length);
    const ok = cells === 11 * 78;
    if (!ok) failures++;
    console.log(`[smoke] ${ok ? '✓' : '✗'} ${name} (heatmap cells: ${cells})`);
    writeFileSync(`${OUT}/${name}.png`, shot);
  }
}

await browser.close();
server.close();
console.log(failures === 0 ? 'SMOKE: green' : `SMOKE: ${failures} failures`);
process.exit(failures === 0 ? 0 : 1);
