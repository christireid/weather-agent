// CI smoke test (spec Part 8): load the built page headless with software
// WebGL, assert the canvas produces non-black pixels, capture one still per
// named state.
import { mkdirSync } from 'node:fs';
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

  // Non-black-canvas assertion (skip for boring — the canvas is dimmed there).
  if (st.mode !== 'boring') {
    const lit = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return -1;
      const gl = canvas.getContext('webgl2');
      if (!gl) return -2;
      const px = new Uint8Array(4 * 64 * 64);
      gl.readPixels(
        Math.floor(canvas.width / 2) - 32,
        Math.floor(canvas.height / 2) - 32,
        64,
        64,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        px,
      );
      let sum = 0;
      for (let i = 0; i < px.length; i += 4) sum += (px[i] + px[i + 1] + px[i + 2]) / 3;
      return sum / (64 * 64);
    });
    const ok = lit > 2; // mean brightness in the canvas center clears black
    if (!ok) {
      failures++;
      console.error(`[smoke] ✗ ${name}: canvas mean brightness ${lit}`);
    } else {
      console.log(`[smoke] ✓ ${name} (canvas lit: ${Number(lit).toFixed(1)})`);
    }
  } else {
    const cells = await page.evaluate(() => document.querySelectorAll('.boring-cell').length);
    const ok = cells === 11 * 78;
    if (!ok) failures++;
    console.log(`[smoke] ${ok ? '✓' : '✗'} ${name} (heatmap cells: ${cells})`);
  }
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

await browser.close();
server.close();
console.log(failures === 0 ? 'SMOKE: green' : `SMOKE: ${failures} failures`);
process.exit(failures === 0 ? 0 : 1);
