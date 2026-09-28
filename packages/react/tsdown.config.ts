import { defineConfig } from 'tsdown';
import { baseBuildConfig } from '@rxova/repo-config/tsdown';

export default defineConfig(
  baseBuildConfig({
    // The shared preset is ESM-only for Node 22. These packages also serve
    // `require()` from their exports maps and run in browsers.
    format: ['esm', 'cjs'],
    target: 'es2020',
    entry: {
      index: 'src/index.ts',
      'devtools/index': 'src/devtools/index.ts',
      testing: 'src/testing.ts',
      'shared-worker': 'src/shared-worker.ts',
    },
    external: ['react', 'react-dom'],
    // @rxova/ts-utils is a devDependency inlined here, as in core, so the only
    // runtime dependency stays @use-everywhere/core.
    deps: { onlyBundle: ['@rxova/ts-utils'] },
    // Every entry is client-only (useSyncExternalStore, BroadcastChannel). The
    // banner marks the built modules as a React Server Components client
    // boundary, so hooks can be imported directly in a Next.js App Router file
    // without the consumer hand-adding 'use client'. It must sit before all
    // imports to take effect, and it has to reach the shared chunks too, not
    // just the entries — a chunk the entry re-exports from is part of the same
    // client boundary.
    banner: { js: "'use client';" },
  }),
);
