import { run } from './run.js';

export interface Io {
  readonly log: (line: string) => void;
  readonly error: (line: string) => void;
  readonly cwd: () => string;
}

export const USAGE = [
  'Usage: use-everywhere-codemod rename-1.0 <path...> [--dry-run]',
  '',
  'Rewrites the use-everywhere 0.x names to their 1.0 spellings in every',
  '.ts, .tsx, .js, .jsx, .mjs, .cjs, .mts and .cts file under the given paths.',
  '',
  '  --dry-run   list the files that would change, and write nothing',
  '',
  'Migration guide: https://rxova.org/packages/use-everywhere/guides/migration/',
].join('\n');

const TRANSFORMS = new Set(['rename-1.0']);

/**
 * The command line behind `bin/use-everywhere-codemod.mjs`, with its I/O passed
 * in so a test can run it without a child process. Returns the exit code
 * instead of exiting: 0 on success, 2 for a usage error, 1 when nothing could
 * be read.
 */
export function main(argv: readonly string[], io: Io): number {
  const [command, ...rest] = argv;
  if (command === undefined || command === '--help' || command === '-h') {
    io.log(USAGE);
    return command === undefined ? 2 : 0;
  }
  if (!TRANSFORMS.has(command)) {
    io.error(`Unknown transform "${command}". The only one is rename-1.0.\n\n${USAGE}`);
    return 2;
  }

  const dryRun = rest.includes('--dry-run');
  const paths = rest.filter((arg) => !arg.startsWith('--'));
  const unknownFlags = rest.filter((arg) => arg.startsWith('--') && arg !== '--dry-run');
  if (unknownFlags.length > 0) {
    io.error(`Unknown option ${unknownFlags.join(', ')}.\n\n${USAGE}`);
    return 2;
  }
  if (paths.length === 0) {
    io.error(`rename-1.0 needs at least one file or directory.\n\n${USAGE}`);
    return 2;
  }

  let result: ReturnType<typeof run>;
  try {
    result = run({ paths, dryRun, cwd: io.cwd() });
  } catch (error) {
    io.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const verb = dryRun ? 'would change' : 'changed';
  for (const file of result.changed) io.log(`  ${dryRun ? '~' : '✔'} ${file}`);
  io.log(
    `${String(result.changed.length)} of ${String(result.scanned.length)} file(s) ${verb}` +
      (dryRun ? ' (dry run — nothing written)' : ''),
  );
  if (result.warnings.length > 0) {
    io.log('');
    io.log('Left for you to check:');
    for (const warning of result.warnings) {
      io.log(`  ${warning.file}:${String(warning.line)} ${warning.message}`);
    }
  }
  return 0;
}
