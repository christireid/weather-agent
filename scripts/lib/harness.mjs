// Shared Playwright harness for all capture/perf/a11y scripts.
// SwiftShader flags proven in Stage 0 (docs/decisions-log.md D-001/D-002).
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const PINNED = '/opt/pw-browsers/chromium';

export const CAPTURE_SIZES = {
  desktop: { width: 1600, height: 1000 },
  mobile: { width: 390, height: 844 },
};

export async function launch(extraArgs = []) {
  return chromium.launch({
    headless: true,
    ...(existsSync(PINNED) ? { executablePath: PINNED } : {}),
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...extraArgs],
  });
}

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json',
};

/** Serve the built app (apps/weather/dist) on an ephemeral port. */
export async function serveDist(root = 'apps/weather/dist') {
  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      let path = join(root, decodeURIComponent(url.pathname));
      if (url.pathname === '/' || !extname(path)) path = join(root, 'index.html');
      try {
        const body = await readFile(path);
        res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
        res.end(body);
      } catch {
        res.writeHead(404);
        res.end('not found');
      }
    })();
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  return { server, base: `http://127.0.0.1:${port}` };
}

/** Wait until the capture bridge is up and a couple of frames have rendered. */
export async function waitForScene(page) {
  await page.waitForFunction(() => window.__mw !== undefined, null, { timeout: 30000 });
  await page.evaluate(() => window.__mw.nextFrame());
}

/** Deterministically settle a state change: let React commit, then render. */
export async function settle(page, frames = 2) {
  for (let i = 0; i < frames; i++) {
    await page.evaluate(() => window.__mw.nextFrame());
  }
}
