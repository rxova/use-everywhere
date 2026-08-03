import { resolve } from 'node:path';
import { build } from 'vite';

/**
 * Builds the two micro-frontend bundles the `mfe.html` fixture loads.
 *
 * Two separate `build()` calls, deliberately. One build with two entries would
 * let Rollup hoist the shared library into a common chunk — leaving *one* copy
 * on the page and quietly turning the test that depends on there being two into
 * a test of nothing at all.
 */
const dir = import.meta.dirname;

for (const name of ['a', 'b']) {
  await build({
    configFile: false,
    logLevel: 'warn',
    // The output lands *inside* the public directory, which is the point — the
    // fixture loads it as a plain script. Vite warns about that overlap unless
    // told there is no public directory to copy for these builds.
    publicDir: false,
    build: {
      lib: {
        entry: resolve(dir, `mfe/${name}.ts`),
        formats: ['iife'],
        name: `mfe_bundle_${name}`,
        fileName: () => `${name}.js`,
      },
      outDir: resolve(dir, 'public/mfe'),
      emptyOutDir: false,
      minify: false,
    },
  });
}
