import { readFileSync } from "node:fs";
import process from "node:process";

/**
 * Fail when any mutated module falls below the mutation-score floor.
 *
 * Stryker's own `thresholds.break` gates the **overall** score, which a large
 * well-tested file can hold up while a small one rots underneath it. The
 * roadmap's target is per module — "≥90% on core state modules" — so the per-file
 * check lives here.
 *
 * Reads the JSON report rather than re-running anything: the mutation run is
 * minutes long and has already happened by the time this executes.
 */
export const FLOOR = 90;

export interface FileScore {
  readonly file: string;
  readonly score: number;
  readonly killed: number;
  readonly total: number;
}

interface MutantResult {
  status: string;
  static?: boolean;
}

interface MutationReport {
  files: Record<string, { mutants: MutantResult[] }>;
}

/**
 * A mutant that nothing could have killed is not a gap in the tests.
 *
 * `Ignored` is Stryker's own word for one excluded by a `// Stryker disable`
 * comment; `CompileError` never ran. Counting either would punish the very
 * annotations that record a considered decision.
 */
const COUNTED = new Set(["Killed", "Survived", "Timeout", "NoCoverage"]);
const SUCCESSFUL = new Set(["Killed", "Timeout"]);

/**
 * The smallest number of non-static mutants worth drawing a conclusion from.
 *
 * Below this a module legitimately might kill none of them, so the check keeps
 * quiet rather than failing a small `mutate` list for the wrong reason.
 */
const RUNNER_FAILURE_SAMPLE = 20;

/**
 * Whether the report is describing a broken test runner rather than weak tests.
 *
 * A **static** mutant — one whose code runs at import — makes Stryker re-run the
 * whole suite, so it dies without the per-test filter being involved. Every
 * other mutant is run through that filter. When the filter is broken the two
 * come apart completely: static mutants keep dying and non-static ones all
 * survive having executed no tests at all.
 *
 * That is not a score. It happened here for eight scheduled runs in a row
 * (@stryker-mutator/vitest-runner 10.0.0 against Vitest 5, which joined the
 * suite chain differently when matching `testNamePattern`): 10 killed, all
 * static, against 1383 survived, all non-static, reported as 0.72%. See
 * `packages/core/MUTATION.md`. A version floor cannot prevent the next one — no
 * dependency range expresses "the runner must support the installed Vitest" —
 * so the signature is checked here instead.
 */
export function runnerFailure(report: MutationReport): string | undefined {
  const counted = Object.values(report.files)
    .flatMap((data) => data.mutants)
    .filter((m) => COUNTED.has(m.status));
  const nonStatic = counted.filter((m) => m.static !== true);
  if (nonStatic.length < RUNNER_FAILURE_SAMPLE) return undefined;
  if (nonStatic.some((m) => SUCCESSFUL.has(m.status))) return undefined;

  const killed = counted.filter((m) => SUCCESSFUL.has(m.status));
  return (
    `not one of ${String(nonStatic.length)} non-static mutants was killed, ` +
    `while ${String(killed.length)} static ${killed.length === 1 ? "mutant was" : "mutants were"}. ` +
    `The per-test filter is selecting no tests, so this score measures the runner, not the suite.`
  );
}

export function scoreByFile(report: MutationReport): FileScore[] {
  return Object.entries(report.files)
    .map(([file, data]) => {
      const counted = data.mutants.filter((m) => COUNTED.has(m.status));
      const killed = counted.filter((m) => SUCCESSFUL.has(m.status)).length;
      const total = counted.length;
      return { file, killed, total, score: total === 0 ? 100 : (killed / total) * 100 };
    })
    .sort((a, b) => a.score - b.score);
}

export function report(
  scores: readonly FileScore[],
  floor = FLOOR,
): { ok: boolean; lines: string[] } {
  const lines = scores.map(
    (s) =>
      `  ${s.score >= floor ? "✔" : "✖"} ${s.score.toFixed(2).padStart(6)}%  ` +
      `${String(s.killed).padStart(4)}/${String(s.total).padEnd(4)}  ${s.file}`,
  );
  return { ok: scores.every((s) => s.score >= floor), lines };
}

/* v8 ignore start -- the CLI wrapper; the logic above is what the tests drive */
function main(): void {
  const path = process.argv[2] ?? "packages/core/reports/mutation/mutation.json";
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    console.error(`✖ no mutation report at ${path} — run \`pnpm run mutation\` first`);
    process.exit(1);
  }
  const parsed = JSON.parse(raw) as MutationReport;
  const broken = runnerFailure(parsed);
  if (broken !== undefined) {
    console.error(`✖ this report is not a mutation score: ${broken}`);
    console.error(
      `  Check the runner against the installed Vitest before touching a test — ` +
        `"When the number itself is wrong" in packages/core/MUTATION.md.`,
    );
    process.exit(1);
  }
  const scores = scoreByFile(parsed);
  const { ok, lines } = report(scores);
  console.log(`Mutation score per module (floor ${String(FLOOR)}%):`);
  console.log(lines.join("\n"));
  if (!ok) {
    console.error(
      `\n✖ at least one module is below ${String(FLOOR)}%. Kill the survivors, or mark the ` +
        `unkillable ones with a \`// Stryker disable next-line\` and a reason.`,
    );
    process.exit(1);
  }
  console.log(`\n✔ every module is at or above ${String(FLOOR)}%.`);
}

if (process.argv[1]?.includes("check-mutation")) main();
/* v8 ignore stop */
