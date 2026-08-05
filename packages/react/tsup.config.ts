import { defineConfig } from 'tsup';

export default defineConfig({
  // Object form, not an array: given an array tsup infers a common base dir for
  // the outputs, and if it infers a different one you silently get
  // dist/index2.js while exports, size-limit, and TypeDoc all point at
  // dist/devtools/index.js — a file that does not exist.
  entry: {
    index: 'src/index.ts',
    'devtools/index': 'src/devtools/index.ts',
    testing: 'src/testing.ts',
    'shared-worker': 'src/shared-worker.ts',
  },
  // Dual ESM + CJS so `require('use-everywhere')` works (Jest/CJS toolchains).
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  target: 'es2020',
  external: ['react', 'react-dom'],
  // Every entry is client-only (useSyncExternalStore, BroadcastChannel). The
  // banner marks the built modules as a React Server Components client boundary,
  // so hooks can be imported directly in a Next.js App Router file without the
  // consumer hand-adding 'use client'. esbuild emits the banner before all
  // imports, which is where the directive must sit to take effect.
  banner: { js: "'use client';" },
});
