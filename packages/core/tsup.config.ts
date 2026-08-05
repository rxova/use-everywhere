import { defineConfig } from 'tsup';

export default defineConfig({
  // Object form, not an array: an array makes tsup infer a common base dir, and
  // a different inference silently renames outputs the exports map points at.
  entry: {
    index: 'src/index.ts',
    testing: 'src/testing.ts',
    // The relay a SharedWorker script imports. Its own entry because it is
    // loaded *as* a worker: bundling it into index would make every app that
    // imports a hook carry an `onconnect` handler.
    'shared-worker': 'src/shared-worker.ts',
  },
  // Dual ESM + CJS: the exports map serves .js to `import` and .cjs to
  // `require`, so Jest/ts-node/CJS toolchains resolve instead of failing.
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  target: 'es2020',
});
