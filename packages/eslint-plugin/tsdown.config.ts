import { defineConfig } from 'tsdown';
import { baseBuildConfig } from '@rxova/repo-config/tsdown';

// Dual ESM + CJS, over the shared preset's ESM-only default, earns its keep here: ESLint 9+ loads flat
// configs as ESM, but a project on `eslint.config.cjs` still `require()`s its
// plugins, and a plugin that only ships ESM is unusable there.
export default defineConfig(baseBuildConfig({ format: ['esm', 'cjs'], target: 'es2020' }));
