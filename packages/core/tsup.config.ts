import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  // Dual ESM + CJS: the exports map serves .js to `import` and .cjs to
  // `require`, so Jest/ts-node/CJS toolchains resolve instead of failing.
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  target: 'es2020',
});
