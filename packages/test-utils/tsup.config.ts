import { defineConfig } from 'tsup';

export default defineConfig({
  // Object form, not an array: an array makes tsup infer a common base dir, and
  // a different inference silently renames outputs the exports map points at.
  entry: { index: 'src/index.ts' },
  // Dual ESM + CJS: test runners are the one place CJS is still routine.
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  target: 'es2020',
  // Peer-ish: the library under test must be the same instance the test
  // imports, or the registry singletons would not line up.
  external: ['@use-everywhere/core'],
});
