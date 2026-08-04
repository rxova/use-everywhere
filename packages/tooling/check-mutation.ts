import { readFileSync } from 'node:fs';
import process from 'node:process';

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
const COUNTED = new Set(['Killed', 'Survived', 'Timeout', 'NoCoverage']);
const SUCCESSFUL = new Set(['Killed', 'Timeout']);

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
      `  ${s.score >= floor ? '✔' : '✖'} ${s.score.toFixed(2).padStart(6)}%  ` +
      `${String(s.killed).padStart(4)}/${String(s.total).padEnd(4)}  ${s.file}`,
  );
  return { ok: scores.every((s) => s.score >= floor), lines };
}

/* v8 ignore start -- the CLI wrapper; the logic above is what the tests drive */
function main(): void {
  const path = process.argv[2] ?? 'packages/core/reports/mutation/mutation.json';
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    console.error(`✖ no mutation report at ${path} — run \`pnpm run mutation\` first`);
    process.exit(1);
  }
  const scores = scoreByFile(JSON.parse(raw) as MutationReport);
  const { ok, lines } = report(scores);
  console.log(`Mutation score per module (floor ${String(FLOOR)}%):`);
  console.log(lines.join('\n'));
  if (!ok) {
    console.error(
      `\n✖ at least one module is below ${String(FLOOR)}%. Kill the survivors, or mark the ` +
        `unkillable ones with a \`// Stryker disable next-line\` and a reason.`,
    );
    process.exit(1);
  }
  console.log(`\n✔ every module is at or above ${String(FLOOR)}%.`);
}

if (process.argv[1]?.includes('check-mutation')) main();
/* v8 ignore stop */
