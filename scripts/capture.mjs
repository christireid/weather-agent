// Loop B capture script: stills of the named scene states (spec §3.1) at the
// fixed capture dimensions, tier pinned via ?tier=. Usage:
//   node scripts/capture.mjs [--states=field-storm,field-calm] [--tiers=high,low] [--out=docs/screenshots/loop-b]
import { mkdirSync } from 'node:fs';
import { CAPTURE_SIZES, launch, serveDist, settle, waitForScene } from './lib/harness.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.replace(/^--/, '').split('=')),
);

// Named scene states → URL params (spec §3.1). All use the default seed.
const STATES = {
  title: { act: 'title', t: 0 },
  'field-open': { t: 0 },
  'field-calm': { t: 75 },
  'field-storm': { t: 290 },
  'field-close': { t: 389 },
  'focus-open': { t: 290, focus: 'technology' },
  review: { act: 'review', t: 389 },
  boring: { t: 290, mode: 'boring' },
};

const states = (args.states ?? 'field-open,field-calm,field-storm,field-close').split(',');
const tiers = (args.tiers ?? 'high,low').split(',');
const sizes = (args.sizes ?? 'desktop,mobile').split(',');
const out = args.out ?? 'docs/screenshots/loop-b';
mkdirSync(out, { recursive: true });

const { server, base } = await serveDist();
const browser = await launch();

for (const sizeName of sizes) {
  const viewport = CAPTURE_SIZES[sizeName];
  for (const tier of tiers) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => console.error(`[pageerror] ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') console.error(`[console] ${m.text()}`);
    });
    for (const name of states) {
      const st = STATES[name];
      if (!st) {
        console.error(`unknown state ${name}`);
        continue;
      }
      const p = new URLSearchParams({ capture: '1', tier, t: String(st.t ?? 0) });
      if (st.mode) p.set('mode', st.mode);
      if (st.focus) p.set('focus', st.focus);
      if (st.act) p.set('act', st.act);
      await page.goto(`${base}/?${p.toString()}`);
      await waitForScene(page);
      await settle(page, 3);
      const file = `${out}/${name}-${tier}-${sizeName}.png`;
      await page.screenshot({ path: file });
      console.log(`captured ${file}`);
      if (sizeName === 'mobile' && tier === 'low') break; // one mobile capture per spec §1.3
    }
    await page.close();
    if (sizeName === 'mobile') break; // mobile: single tier
  }
}

await browser.close();
server.close();
