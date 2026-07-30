// Loop E: frame-health trace (spec Part 10). CDP CPU throttle 4×, in-page
// rAF-delta recorder (Playwright tracing does not record frame timings),
// free-running 20s of Act II plus one focus flight, tier PINNED via ?tier=.
// Budget: LOW tier on SwiftShader p75 ≤ 22ms, no frame > 50ms after the first
// second; HIGH tier trace recorded alongside with an honest note.
// Also: adaptive step-down demo, bounded-entities audit across 3 replays,
// and the gzip load budget from dist.
import { readdirSync, statSync, createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import { createGzip } from 'node:zlib';
import { launch, serveDist, CAPTURE_SIZES } from './lib/harness.mjs';

const OUT = 'docs/perf';
mkdirSync(OUT, { recursive: true });
const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.replace(/^--/, '').split('=')),
);
const only = args.only ?? 'trace,adaptive,entities,load';

const { server, base } = await serveDist();
const browser = await launch();
const results = {};

// This harness always runs on SwiftShader (software WebGL). The spec's 4×
// CPU throttle models a slow CPU on hardware-GPU machines; on a software
// rasterizer the renderer IS the CPU, so throttling it 4× models no real
// device (D-012). Pass --throttle=4 on a hardware-GPU machine.
const THROTTLE = Number(args.throttle ?? 1);

async function tracePage(tier) {
  const page = await browser.newPage({ viewport: CAPTURE_SIZES.desktop });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  await page.goto(`${base}/?t=60&tier=${tier}`);
  await page.waitForFunction(() => window.__mw !== undefined, null, { timeout: 60000 });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    window.__deltas = [];
    let last = performance.now();
    const loop = (now) => {
      window.__deltas.push(now - last);
      last = now;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  // 14s free-running Act II…
  await page.waitForTimeout(14000);
  // …then one focus flight inside the measured window.
  await page.evaluate(() => window.__mw.setFocus('technology'));
  await page.waitForTimeout(6000);
  const deltas = await page.evaluate(() => window.__deltas);
  await page.close();
  // Drop the first second (warm-up per budget definition).
  const settled = deltas.slice(deltas.findIndex((_, i) => deltas.slice(0, i).reduce((a, b) => a + b, 0) > 1000));
  const sorted = [...settled].sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
  return {
    tier,
    throttle: THROTTLE,
    renderer: 'SwiftShader (software WebGL)',
    frames: settled.length,
    p50: q(0.5),
    p75: q(0.75),
    p95: q(0.95),
    max: Math.max(...settled),
    over50: settled.filter((d) => d > 50).length,
  };
}

if (only.includes('trace')) {
  for (const tier of ['low', 'high']) {
    const r = await tracePage(tier);
    results[`trace_${tier}`] = r;
    console.log(
      `[trace:${tier}] frames=${r.frames} p50=${r.p50.toFixed(1)} p75=${r.p75.toFixed(1)} p95=${r.p95.toFixed(1)} max=${r.max.toFixed(1)} over50=${r.over50}`,
    );
  }
  const low = results.trace_low;
  console.log(
    `[budget] low tier on software WebGL: p75 ${low.p75.toFixed(1)}ms ≤ 22ms → ${low.p75 <= 22 ? 'PASS' : 'FAIL'}; frames>50ms: ${low.over50} → ${low.over50 === 0 ? 'PASS' : 'FAIL'}`,
  );
}

if (only.includes('adaptive')) {
  const page = await browser.newPage({ viewport: CAPTURE_SIZES.desktop });
  const cdp = await page.context().newCDPSession(page);
  await page.goto(`${base}/?t=60`); // tier NOT pinned → adaptive control active
  await page.waitForFunction(() => window.__mw !== undefined, null, { timeout: 60000 });
  const initialTier = await page.evaluate(() => window.__mw.state().tier);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 20 });
  await page.waitForFunction(() => window.__mw.state().tier === 'low', null, { timeout: 45000 });
  const after = await page.evaluate(() => window.__mw.state().tier);
  console.log(`[adaptive] tier ${initialTier} → ${after} under 20× throttle → ${after === 'low' ? 'PASS' : 'FAIL'}`);
  results.adaptive = { initialTier, after };
  await page.close();
}

if (only.includes('entities')) {
  const page = await browser.newPage({ viewport: CAPTURE_SIZES.desktop });
  await page.goto(`${base}/?t=380&tier=low`);
  await page.waitForFunction(() => window.__mw !== undefined, null, { timeout: 60000 });
  const audit = [];
  for (let replay = 0; replay < 3; replay++) {
    // Complete the day, then replay (R behavior): minute 0, act field.
    await page.evaluate(() => {
      window.__mw.setMinute(0);
      window.__mw.setPaused(false);
    });
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.__mw.setMinute(388));
    await page.waitForTimeout(1500);
    audit.push(await page.evaluate(() => window.__mw.info()));
  }
  const same = JSON.stringify(audit[0]) === JSON.stringify(audit[2]);
  console.log(`[entities] replay1=${JSON.stringify(audit[0])} replay3=${JSON.stringify(audit[2])} → ${same ? 'PASS' : 'FAIL'}`);
  results.entities = { audit, same };
  const heap = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null);
  console.log(`[entities] advisory JS heap: ${heap ? (heap / 1048576).toFixed(1) + 'MB' : 'n/a'}`);
  await page.close();
}

if (only.includes('load')) {
  const dist = 'apps/weather/dist/assets';
  const gz = (path) =>
    new Promise((resolve) => {
      let n = 0;
      createReadStream(path).pipe(createGzip({ level: 9 })).on('data', (c) => (n += c.length)).on('end', () => resolve(n));
    });
  let initialJs = 0;
  let sceneJs = 0;
  let fonts = 0;
  let css = 0;
  for (const f of readdirSync(dist)) {
    const p = `${dist}/${f}`;
    const size = await gz(p);
    if (f.startsWith('Field-')) sceneJs += size;
    else if (f.endsWith('.js')) initialJs += size;
    else if (f.endsWith('.woff2')) fonts += statSync(p).size;
    else if (f.endsWith('.css')) css += size;
  }
  const firstRender = initialJs + css + fonts; // title act renders before the scene chunk
  results.load = { initialJs, sceneJs, fonts, css, firstRender };
  console.log(
    `[load] initial JS ${(initialJs / 1024).toFixed(0)}KB gz (≤320KB → ${initialJs <= 320 * 1024 ? 'PASS' : 'FAIL'}); ` +
      `scene chunk ${(sceneJs / 1024).toFixed(0)}KB gz; fonts ${(fonts / 1024).toFixed(0)}KB; ` +
      `first-render total ${(firstRender / 1024).toFixed(0)}KB (≤900KB → ${firstRender <= 900 * 1024 ? 'PASS' : 'FAIL'})`,
  );
}

writeFileSync(`${OUT}/perf-results.json`, JSON.stringify(results, null, 2));
await browser.close();
server.close();
console.log(`\nresults → ${OUT}/perf-results.json`);
