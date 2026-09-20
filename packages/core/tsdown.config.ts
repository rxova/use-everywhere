import { defineConfig } from 'tsdown';
import { baseBuildConfig } from '@repo/config/tsdown.base';

export default defineConfig(
  baseBuildConfig({
    entry: {
      index: 'src/index.ts',
      testing: 'src/testing.ts',
      // The relay a SharedWorker script imports. Its own entry because it is
      // loaded *as* a worker: bundling it into index would make every app that
      // imports a hook carry an `onconnect` handler.
      'shared-worker': 'src/shared-worker.ts',
    },
  }),
);
