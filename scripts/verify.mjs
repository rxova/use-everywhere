import { spawnSync } from 'node:child_process';
import process from 'node:process';

/**
 * One ordered definition of "is this releasable", executed locally by the
 * pre-push hook. CI runs the same checks split across parallel jobs, so a green
 * push means a green pipeline.
 *
 * The point of a single list is that the local gate and CI cannot drift. Before
 * this existed the pre-commit hook ran lint + typecheck + the whole test suite
 * on every commit — slow enough to invite `--no-verify`, and still missing the
 * audit and dedupe checks entirely. Now: lint-staged on commit, this on push.
 *
 * Ordered cheapest-and-most-likely-to-fail first, so a formatting slip surfaces
 * in a second rather than after the browser suite.
 *
 * Every step is skip-cheap when nothing it reads has changed, and the skipping
 * is content-hashed, never git-diff based — Turbo hashes the files that feed
 * each task, and eslint/prettier key on file content plus config. A rebased or
 * cherry-picked tree that ends up byte-identical replays; one that does not
 * re-runs exactly the packages that differ. No git state can make it silently
 * under-check.
 *
 * E2E is deliberately absent: it drives a real browser against a dev server and
 * takes long enough that including it would push people around the hook. CI
 * runs it as its own job, matching react-feedback-stars and react-inputs.
 */
export const steps = [
  { name: 'Audit dependencies', script: 'audit:check' },
  // Cached by Turbo on the lockfile + manifests (see turbo.json) rather than run
  // directly, which turns the slowest step in the gate into a replay whenever
  // the dependency graph is untouched.
  { name: 'Check dependency dedupe', turbo: ['//#dedupe:check'] },
  { name: 'Check formatting', script: 'format:check' },
  { name: 'Lint', script: 'lint' },
  // Turbo already knows ^build must precede typecheck and test, and that build
  // must precede size, so handing it whole sets lets it parallelise across the
  // five packages and pay the pnpm+turbo startup twice rather than four times.
  //
  // The docs site is excluded from the build, matching the CI `checks` job:
  // rehype-mermaid renders its diagrams through headless chromium, so building
  // it requires `pnpm exec playwright install chromium` first. Gating every push
  // on that would make a fresh clone fail this hook for a reason unrelated to
  // the change. The Docs workflow owns that build and installs the browser; run
  // `pnpm --filter @use-everywhere/docs build` yourself when touching the site.
  //
  // Its `typecheck` (astro check) still runs below — that one needs no browser.
  // `size` depends on its own package's build, so the docs filter has to cover
  // both tasks — filtering only `build` lets `size` schedule `docs#build` again.
  {
    name: 'Build and size budgets (docs site excluded — needs a browser)',
    turbo: ['build', 'size', '--filter=!@use-everywhere/docs'],
  },
  // Safe unfiltered: `typecheck` depends on `^build` (its dependencies), never
  // on its own package's build, so the docs site is checked without being built.
  {
    name: 'Typecheck and test',
    turbo: ['typecheck', 'test'],
  },
  // publint and attw read the manifest and the emitted types.
  { name: 'Check package publishing metadata', script: 'check:exports' },
  // Last, and a plain script rather than joining a Turbo batch: it shells out
  // to a real `pnpm pack` and `npm install` into a temp dir, which races on the
  // store if run concurrently with anything else. Hence --concurrency=1 in the
  // root script.
  { name: 'Smoke-test the package tarballs', script: 'pack:smoke' },
];

const runStep = (step) =>
  step.turbo
    ? spawnSync('pnpm', ['exec', 'turbo', 'run', ...step.turbo], { stdio: 'inherit' })
    : spawnSync('pnpm', ['run', step.script], { stdio: 'inherit' });

export function runVerify({ log = console.log, error = console.error, run = runStep } = {}) {
  for (const [index, step] of steps.entries()) {
    log(`\n[${index + 1}/${steps.length}] ${step.name}`);
    const result = run(step);
    if (result.status !== 0) {
      error(`\n✗ ${step.name} failed. Fix it and re-run \`pnpm run verify\`.`);
      return result.status ?? 1;
    }
  }

  log(`\n✓ all ${steps.length} stages passed`);
  return 0;
}

process.exit(runVerify());
