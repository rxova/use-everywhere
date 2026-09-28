import { defineConfig } from 'tsdown';
import { baseBuildConfig } from '@rxova/repo-config/tsdown';

export default defineConfig(
  baseBuildConfig({
    // The shared preset is ESM-only for Node 22. These packages also serve
    // `require()` from their exports maps and run in browsers.
    format: ['esm', 'cjs'],
    target: 'es2020',
    // `cli` is the entry `bin/use-everywhere-codemod.mjs` imports. It lives in
    // the same build as `index` so one `clean` covers both; the shebang is on
    // the wrapper, which is why the bundle itself needs no banner.
    entry: { index: 'src/index.ts', cli: 'src/cli.ts' },
    platform: 'node',
  }),
);
