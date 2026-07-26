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
  // One Turbo invocation instead of four sequential `pnpm run`s. Turbo already
  // knows ^build must precede typecheck and test, and build must precede size,
  // so handing it the whole set lets it parallelise across the five packages and
  // pay the pnpm+turbo startup once rather than four times.
  {
    name: 'Build, typecheck, test and size budgets',
    turbo: ['build', 'typecheck', 'test', 'size'],
  },
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
