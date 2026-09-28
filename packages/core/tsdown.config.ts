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
      testing: 'src/testing.ts',
      // The relay a SharedWorker script imports. Its own entry because it is
      // loaded *as* a worker: bundling it into index would make every app that
      // imports a hook carry an `onconnect` handler.
      'shared-worker': 'src/shared-worker.ts',
    },
    // @rxova/ts-utils is a root devDependency inlined here, so core keeps zero
    // runtime dependencies; `onlyBundle` names it as the one dependency the build
    // may inline.
    deps: { onlyBundle: ['@rxova/ts-utils'] },
  }),
);
