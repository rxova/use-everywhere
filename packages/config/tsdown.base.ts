import type { UserConfig } from 'tsdown';

/**
 * The shared build defaults, so raising the floor is a single-file change
 * rather than a sweep across five packages that misses one.
 *
 * Dual ESM + CJS everywhere: the exports maps serve `.js` to `import` and
 * `.cjs` to `require`, so Jest, ts-node and other CJS toolchains resolve
 * instead of failing. It also gives `check:exports` two independent
 * resolutions to prove — an exports map that resolves under a bundler but not
 * under plain Node is the classic silent breakage, and a `require()` path is
 * the cheapest way to catch it.
 *
 * `fixedExtension` stays off deliberately. It would emit `.mjs`/`.cjs`, and
 * every published exports map here points at `.js`/`.cjs`; turning it on would
 * rename files consumers already resolve.
 *
 * Entries are passed per package as an object, never an array. An array makes
 * the output paths depend on an inferred common base dir, and a different
 * inference silently renames the files the exports maps, the size budgets and
 * TypeDoc all point at.
 */
export const baseBuildConfig = (overrides: UserConfig = {}): UserConfig => ({
  entry: { index: 'src/index.ts' },
  format: ['esm', 'cjs'],
  target: 'es2020',
  fixedExtension: false,
  dts: true,
  clean: true,
  ...overrides,
});
