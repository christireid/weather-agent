import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import glsl from 'vite-plugin-glsl';

export default defineConfig({
  plugins: [react(), glsl({ minify: true })],
  build: {
    target: 'es2022',
    // The three.js scene is intentionally its own lazy chunk (loaded behind the
    // title act) so the initial JS stays inside the 320KB gzip budget.
    chunkSizeWarningLimit: 1200,
  },
});
