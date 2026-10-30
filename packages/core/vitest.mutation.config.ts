import { baseVitestConfig } from "@rxova/repo-config/vitest";

// The suite as Stryker runs it: `vitest.config.ts`, minus the suites that assert on a *built*
// bundle rather than on behaviour.
//
// `dev-stripping.test.ts` bundles `src/index.ts` through esbuild with `minify` and asserts that no
// development `UEnnnn` code survives. Stryker instruments every mutated module first, which wraps
// each literal `process.env.NODE_ENV !== "production"` guard in a mutant switch that esbuild can no
// longer fold — so every warning stays in the bundle and the test fails against the instrumented
// tree while passing against the real one. It measures what the bundler can strip, not whether
// anything checks behaviour, so it has nothing to say about a mutant in either direction.
//
// Until 2026-10 this exclusion was accidental: `vitest.related` kept handing Stryker a pruned file
// list that happened to leave the suite out. Naming it here is what lets `related` be turned off —
// see `_comment_vitest` in `stryker.config.json`.
export default baseVitestConfig({
  root: import.meta.dirname,
  exclude: ["src/__tests__/**"],
  testExclude: ["src/__tests__/dev-stripping.test.ts"],
});
