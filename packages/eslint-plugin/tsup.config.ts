import { defineConfig } from 'tsup';

export default defineConfig({
  // Object form, not an array: an array makes tsup infer a common base dir, and
  // a different inference silently renames outputs the exports map points at.
  entry: { index: 'src/index.ts' },
  // Dual ESM + CJS. ESLint 9+ loads flat configs as ESM, but a project on
  // `eslint.config.cjs` still `require()`s its plugins, and a plugin that only
  // ships ESM is unusable there.
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  target: 'es2020',
});
