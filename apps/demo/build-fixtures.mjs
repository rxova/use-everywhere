import { resolve } from 'node:path';
import { build } from 'vite';

/**
 * Builds the fixture bundles that Vite cannot serve as modules, into
 * `public/` where the fixtures load them as plain scripts.
 *
 * Two kinds live here, for two different reasons:
 *
 * - **`mfe/a.js`, `mfe/b.js`** — two micro-frontends on one page. Two separate
 *   `build()` calls, deliberately: one build with two entries would let Rollup
 *   hoist the shared library into a common chunk, leaving *one* copy on the
 *   page and quietly turning the test that depends on there being two into a
 *   test of nothing at all.
 * - **`relay/worker.js`** — the SharedWorker behind `relay.html`.
 *   `SharedWorkerTransport` constructs `new SharedWorker(url, { name })`
 *   without `type: 'module'`, so the script it points at cannot carry `import`
 *   and has to arrive pre-bundled. That is the transport's contract, not a
 *   limitation of the fixture: a stable URL is what makes a SharedWorker
 *   shared, so the worker is a file the app serves rather than something a tab
 *   assembles for itself.
 */
const dir = import.meta.dirname;

/** Entry → output, each built on its own so nothing is hoisted between them. */
const fixtures = [
  { entry: 'mfe/a.ts', outDir: 'public/mfe', file: 'a.js', name: 'mfe_bundle_a' },
  { entry: 'mfe/b.ts', outDir: 'public/mfe', file: 'b.js', name: 'mfe_bundle_b' },
  { entry: 'relay/worker.ts', outDir: 'public/relay', file: 'worker.js', name: 'relay_worker' },
];

for (const fixture of fixtures) {
  await build({
    configFile: false,
    logLevel: 'warn',
    // The output lands *inside* the public directory, which is the point — the
    // fixtures load it as a plain script. Vite warns about that overlap unless
    // told there is no public directory to copy for these builds.
    publicDir: false,
    build: {
      lib: {
        entry: resolve(dir, fixture.entry),
        formats: ['iife'],
        name: fixture.name,
        fileName: () => fixture.file,
      },
      outDir: resolve(dir, fixture.outDir),
      emptyOutDir: false,
      minify: false,
    },
  });
}
