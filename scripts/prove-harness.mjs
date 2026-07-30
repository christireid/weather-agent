// Stage 0 gate: prove headless Chromium can render WebGL via software rasterization.
// Renders a colored triangle with raw WebGL2 and saves a screenshot for visual inspection.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'docs/screenshots/harness';
mkdirSync(OUT, { recursive: true });

const html = `<!doctype html><html><body style="margin:0">
<canvas id="c" width="800" height="500"></canvas>
<script>
const gl = document.getElementById('c').getContext('webgl2');
window.__glInfo = gl ? {
  renderer: gl.getParameter(gl.RENDERER),
  vendor: gl.getParameter(gl.VENDOR),
  version: gl.getParameter(gl.VERSION),
} : null;
if (gl) {
  const vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, '#version 300 es\\nin vec2 p; in vec3 col; out vec3 vCol; void main(){ vCol=col; gl_Position=vec4(p,0.,1.);}');
  gl.compileShader(vs);
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, '#version 300 es\\nprecision highp float; in vec3 vCol; out vec4 o; void main(){ o=vec4(vCol,1.);}');
  gl.compileShader(fs);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -0.8, -0.7,  1, 0.71, 0.36,   // warm amber
     0.8, -0.7,  0.37, 0.42, 0.82, // cool violet
     0.0,  0.8,  0.95, 0.93, 0.89, // paper
  ]), gl.STATIC_DRAW);
  const pLoc = gl.getAttribLocation(prog, 'p');
  const cLoc = gl.getAttribLocation(prog, 'col');
  gl.enableVertexAttribArray(pLoc);
  gl.vertexAttribPointer(pLoc, 2, gl.FLOAT, false, 20, 0);
  gl.enableVertexAttribArray(cLoc);
  gl.vertexAttribPointer(cLoc, 3, gl.FLOAT, false, 20, 8);
  gl.clearColor(0.043, 0.047, 0.078, 1); // #0B0C14
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  window.__done = true;
}
</script></body></html>`;

const flagSets = [
  { name: 'swiftshader', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  { name: 'swiftshader-gl', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'] },
];

for (const { name, args } of flagSets) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/opt/pw-browsers/chromium',
    args,
  });
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  await page.setContent(html);
  await page.waitForTimeout(300);
  const info = await page.evaluate(() => window.__glInfo);
  const done = await page.evaluate(() => window.__done === true);
  console.log(`[${name}] webgl2:`, info, 'drew:', done);
  if (done) {
    await page.screenshot({ path: `${OUT}/triangle-${name}.png` });
    console.log(`[${name}] screenshot saved`);
  }
  await browser.close();
}
