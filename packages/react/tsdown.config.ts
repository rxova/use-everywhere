import { defineConfig } from 'tsdown';
import { baseBuildConfig } from '@repo/config/tsdown.base';

export default defineConfig(
  baseBuildConfig({
    entry: {
      index: 'src/index.ts',
      'devtools/index': 'src/devtools/index.ts',
      testing: 'src/testing.ts',
      'shared-worker': 'src/shared-worker.ts',
    },
    external: ['react', 'react-dom'],
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
