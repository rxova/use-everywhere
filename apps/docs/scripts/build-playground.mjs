import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { build } from 'vite';

/**
 * Builds the interactive playground into `public/playground/`.
 *
 * The output is generated rather than committed — same arrangement as the
 * demo's MFE bundles — so the thing a reader clicks is built from the sources
 * in this repository at the version being documented, not from a bundle that
 * quietly aged.
 *
 * Only the tab needs building. The shell around it owns no library state, so it
 * ships as the hand-written HTML it is.
 */
const dir = resolve(import.meta.dirname, '..');
const out = resolve(dir, 'public/playground');

await mkdir(out, { recursive: true });

await build({
  configFile: false,
  logLevel: 'warn',
  plugins: [react()],
  root: resolve(dir, 'playground'),
  // The bundle is loaded from a page that may be mounted under any base path
  // (the aggregator serves these docs from /packages/use-everywhere/), so every
  // asset reference has to be relative rather than absolute.
  base: './',
  // The output lands inside the public directory, which is the point: Astro
  // copies it verbatim. Vite warns about that overlap unless told there is no
  // public directory of its own to copy.
  publicDir: false,
  build: {
    outDir: out,
    emptyOutDir: true,
    rollupOptions: { input: resolve(dir, 'playground/tab.html') },
  },
});

await copyFile(resolve(dir, 'playground/shell.html'), resolve(out, 'index.html'));

console.log('playground built → apps/docs/public/playground/');
