import { defineConfig } from 'tsdown';
import { baseBuildConfig } from '@repo/config/tsdown.base';

export default defineConfig(
  baseBuildConfig({
    // Peer-ish: the library under test must be the same instance the test
    // imports, or the registry singletons would not line up.
    external: ['@use-everywhere/core'],
  }),
);
