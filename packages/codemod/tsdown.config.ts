import { defineConfig } from 'tsdown';
import { baseBuildConfig } from '@repo/config/tsdown.base';

export default defineConfig(
  baseBuildConfig({
    // `cli` is the entry `bin/use-everywhere-codemod.mjs` imports. It lives in
    // the same build as `index` so one `clean` covers both; the shebang is on
    // the wrapper, which is why the bundle itself needs no banner.
    entry: { index: 'src/index.ts', cli: 'src/cli.ts' },
    platform: 'node',
  }),
);
