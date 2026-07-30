// Compose the OG image (1200×630): the field-storm capture with the title
// type, per spec Part 8. Output → apps/weather/public/og.jpg.
import { readFileSync, writeFileSync } from 'node:fs';
import { launch } from './lib/harness.mjs';

const hero = readFileSync('docs/screenshots/loop-b/field-storm-high-desktop.png').toString('base64');
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(`
<style>
  @font-face { font-family: NR; src: local('Georgia'); }
  body { margin: 0; width: 1200px; height: 630px; overflow: hidden; position: relative; background: #0B0C14; }
  img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .veil { position: absolute; inset: 0; background: linear-gradient(180deg, rgb(11 12 20 / 20%) 0%, rgb(11 12 20 / 0%) 40%, rgb(11 12 20 / 55%) 100%); }
  .type { position: absolute; left: 64px; bottom: 56px; color: #F2EEE4; }
  h1 { font-family: Georgia, serif; font-weight: 500; font-size: 84px; margin: 0 0 10px; letter-spacing: 0.01em; }
  p { font-family: monospace; font-size: 22px; letter-spacing: 0.14em; margin: 0; color: #d8d3c7; text-transform: uppercase; }
</style>
<img src="data:image/png;base64,${hero}"/>
<div class="veil"></div>
<div class="type">
  <h1>Market Weather</h1>
  <p>One simulated trading day, rendered as sky</p>
</div>
`);
await page.waitForTimeout(400);
const buf = await page.screenshot({ type: 'jpeg', quality: 82 });
writeFileSync('apps/weather/public/og.jpg', buf);
console.log(`og.jpg ${(buf.length / 1024).toFixed(0)}KB`);
await browser.close();
