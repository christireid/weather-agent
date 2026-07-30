// Loop D: axe scans, scripted keyboard walk, reduced-motion and no-WebGL
// verification, deuteranopia capture (spec Part 9).
import { mkdirSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { CAPTURE_SIZES, launch, serveDist, waitForScene } from './lib/harness.mjs';

const OUT = 'docs/screenshots/loop-d';
mkdirSync(OUT, { recursive: true });

const { server, base } = await serveDist();
const browser = await launch();
let failures = 0;

// ---------------------------------------------------------------- axe scans
const scanTargets = [
  { name: 'field', url: '/?t=290&tier=low' },
  { name: 'boring', url: '/?t=290&mode=boring' },
  { name: 'focus', url: '/?t=290&focus=technology&tier=low' },
  { name: 'review', url: '/?t=389&act=review&tier=low' },
];

for (const target of scanTargets) {
  const ctx = await browser.newContext({ viewport: CAPTURE_SIZES.desktop });
  const page = await ctx.newPage();
  await page.goto(`${base}${target.url}`);
  await page.waitForFunction(() => window.__mw !== undefined || document.querySelector('.boring'), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => ['critical', 'serious'].includes(v.impact));
  console.log(`[axe:${target.name}] ${results.violations.length} violations, ${serious.length} critical/serious`);
  for (const v of serious) {
    failures++;
    console.log(`  ✗ ${v.impact} ${v.id}: ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  }
  for (const v of results.violations.filter((v) => !['critical', 'serious'].includes(v.impact))) {
    console.log(`  · ${v.impact} ${v.id}: ${v.help}`);
  }
  await ctx.close();
}

// ------------------------------------------------------- keyboard walk (§9.2)
{
  const page = await browser.newPage({ viewport: CAPTURE_SIZES.desktop });
  await page.goto(`${base}/?t=290&tier=low&capture=1`);
  await waitForScene(page);

  const active = () =>
    page.evaluate(() => {
      const el = document.activeElement;
      return `${el?.tagName}.${(el?.className ?? '').toString().split(' ')[0]}#${el?.getAttribute('aria-label') ?? el?.textContent?.slice(0, 20) ?? ''}`;
    });

  const expectSeq = [];
  // Tab order: skip link → HUD controls → scrubber → sector regions → footer.
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab');
    expectSeq.push(await active());
  }
  const flat = expectSeq.join('\n');
  const checks = [
    ['skip link first', expectSeq[0]?.includes('skip-link') ?? false],
    ['HUD controls before scrubber', flat.indexOf('Pause') < flat.indexOf('slider') || flat.indexOf('Resume') < flat.indexOf('timeline')],
    ['scrubber before sector regions', flat.indexOf('timeline') < flat.indexOf('sector-region')],
    ['sector regions reachable', flat.includes('sector-region')],
  ];
  for (const [name, ok] of checks) {
    if (!ok) failures++;
    console.log(`[keyboard] ${ok ? '✓' : '✗'} ${name}`);
  }

  // Sector selection: focus a region button, Enter opens the panel.
  await page.focus('.sector-region');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const panelOpen = await page.evaluate(() => document.querySelector('.focus-panel') !== null);
  console.log(`[keyboard] ${panelOpen ? '✓' : '✗'} Enter on region opens sector panel`);
  if (!panelOpen) failures++;
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  const panelClosed = await page.evaluate(() => {
    const st = window.__mw.state();
    return st.mode === 'field' && !new URLSearchParams(location.search).get('focus');
  });
  console.log(`[keyboard] ${panelClosed ? '✓' : '✗'} Escape releases focus`);

  // B toggles Boring Mode.
  await page.keyboard.press('b');
  await page.waitForTimeout(300);
  const boringOn = await page.evaluate(() => window.__mw.state().mode === 'boring');
  console.log(`[keyboard] ${boringOn ? '✓' : '✗'} B toggles Boring Mode`);
  if (!boringOn) failures++;

  // Scrubber arrows step 5 minutes.
  await page.keyboard.press('b');
  await page.focus('.scrubber svg');
  const before = await page.evaluate(() => window.__mw.state().minute);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => window.__mw.state().minute);
  const stepped = Math.round(after - before) === 5;
  console.log(`[keyboard] ${stepped ? '✓' : '✗'} scrubber arrow steps 5 minutes (${before}→${after})`);
  if (!stepped) failures++;
  await page.close();
}

// -------------------------------------------- reduced motion (§9.7) captures
{
  const page = await browser.newPage({ viewport: CAPTURE_SIZES.desktop, reducedMotion: 'reduce' });
  await page.goto(`${base}/`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/reduced-motion-title.png` });
  // Static field: two frames 1.5s apart must be identical (no autonomous animation).
  const page2 = await browser.newPage({ viewport: CAPTURE_SIZES.desktop, reducedMotion: 'reduce' });
  await page2.goto(`${base}/?t=290&tier=low`);
  await page2.waitForFunction(() => window.__mw !== undefined, null, { timeout: 30000 });
  // Settle one-time events (webfont swap, glyph-texture build) so the
  // stillness assertion tests motion, not load timing.
  await page2.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 15000 }).catch(() => {});
  await page2.waitForFunction(() => window.__mwGlyphsReady === true, null, { timeout: 15000 }).catch(() => {});
  await page2.waitForTimeout(3000);
  const shot1 = await page2.screenshot();
  await page2.waitForTimeout(1500);
  const shot2 = await page2.screenshot();
  const identical = Buffer.compare(shot1, shot2) === 0;
  console.log(`[reduced-motion] ${identical ? '✓' : '✗'} field is static (frames identical)`);
  if (!identical) failures++;
  await page2.screenshot({ path: `${OUT}/reduced-motion-field.png` });
  await page.close();
  await page2.close();
}

// ---------------------------------------------- no-WebGL fallback (§9.8)
{
  const page = await browser.newPage({ viewport: CAPTURE_SIZES.desktop });
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type === 'webgl2' || type === 'webgl') return null;
      return orig.call(this, type, ...args);
    };
  });
  await page.goto(`${base}/?t=290`);
  await page.waitForTimeout(2000);
  const hasBoring = await page.evaluate(() => document.querySelector('.boring') !== null);
  const hasNote = await page.evaluate(() => document.querySelector('.fallback-note') !== null);
  console.log(`[fallback] ${hasBoring && hasNote ? '✓' : '✗'} no-WebGL renders Boring Mode + explanation`);
  if (!hasBoring || !hasNote) failures++;
  await page.screenshot({ path: `${OUT}/fallback-no-webgl.png` });
  await page.close();
}

// ------------------------------------- deuteranopia simulation (§9.6) capture
{
  const page = await browser.newPage({ viewport: CAPTURE_SIZES.desktop });
  await page.goto(`${base}/?t=290&mode=boring`);
  await page.waitForTimeout(1500);
  await page.addStyleTag({
    content: `body { filter: url('#deuteranopia'); }`,
  });
  await page.evaluate(() => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('style', 'position:absolute;width:0;height:0');
    svg.innerHTML = `<filter id="deuteranopia"><feColorMatrix type="matrix" values="0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0"/></filter>`;
    document.body.appendChild(svg);
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/deuteranopia-boring.png` });
  console.log('[deuteranopia] capture saved for inspection');
  await page.close();
}

await browser.close();
server.close();
console.log(failures === 0 ? '\nLOOP D: all checks green' : `\nLOOP D: ${failures} failures`);
process.exit(failures === 0 ? 0 : 1);
