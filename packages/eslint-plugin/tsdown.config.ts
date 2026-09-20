import { defineConfig } from 'tsdown';
import { baseBuildConfig } from '@repo/config/tsdown.base';

// Dual ESM + CJS from the preset earns its keep here: ESLint 9+ loads flat
// configs as ESM, but a project on `eslint.config.cjs` still `require()`s its
// plugins, and a plugin that only ships ESM is unusable there.
export default defineConfig(baseBuildConfig());
