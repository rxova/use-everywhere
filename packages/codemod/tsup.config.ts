import { defineConfig } from 'tsup';

export default defineConfig({
  // Object form, not an array: an array makes tsup infer a common base dir, and
  // a different inference silently renames outputs the exports map points at.
  //
  // `cli` is the entry `bin/use-everywhere-codemod.mjs` imports. It lives in
  // the same build as `index` so one `clean` covers both; the shebang is on the
  // wrapper, which is why the bundle itself needs no banner.
  entry: { index: 'src/index.ts', cli: 'src/cli.ts' },
  // Dual ESM + CJS to match the other packages: the programmatic API is
  // importable from a CommonJS build script too.
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  target: 'es2020',
  platform: 'node',
});
