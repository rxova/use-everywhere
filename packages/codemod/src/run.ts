import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { EXTENSIONS, transform, type TransformWarning } from './transform.js';

export interface RunOptions {
  /** Files or directories to rewrite. A directory is walked; `node_modules` and dot-directories are skipped. */
  readonly paths: readonly string[];
  /** Report what would change without writing anything. */
  readonly dryRun?: boolean;
  /** Paths are resolved against this. Default: the current working directory. */
  readonly cwd?: string;
}

export interface FileWarning extends TransformWarning {
  readonly file: string;
}

export interface RunResult {
  /** Every file that was parsed, relative to `cwd`. */
  readonly scanned: readonly string[];
  /** The subset that was (or, in a dry run, would be) rewritten. */
  readonly changed: readonly string[];
  readonly warnings: readonly FileWarning[];
}

const SKIPPED_DIRECTORIES = new Set(['node_modules']);

const hasKnownExtension = (path: string): boolean =>
  EXTENSIONS.some((extension) => path.endsWith(extension));

/** Every rewritable file beneath `path`, or `path` itself when it is a file. */
export function collectFiles(path: string): string[] {
  if (statSync(path).isFile()) return hasKnownExtension(path) ? [path] : [];
  const found: string[] = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name) || entry.name.startsWith('.')) continue;
      found.push(...collectFiles(join(path, entry.name)));
    } else if (entry.isFile() && hasKnownExtension(entry.name)) {
      found.push(join(path, entry.name));
    }
  }
  return found;
}

/**
 * Run the `rename-1.0` transform over a set of paths, writing the files that
 * change. A file the transform leaves byte-identical is never rewritten, so
 * mtimes — and whatever watches them — are undisturbed.
 */
export function run({ paths, dryRun = false, cwd = process.cwd() }: RunOptions): RunResult {
  const scanned: string[] = [];
  const changed: string[] = [];
  const warnings: FileWarning[] = [];

  for (const path of paths) {
    for (const file of collectFiles(resolve(cwd, path))) {
      const name = relative(cwd, file);
      scanned.push(name);
      const result = transform(readFileSync(file, 'utf8'), file);
      for (const warning of result.warnings) warnings.push({ file: name, ...warning });
      if (!result.changed) continue;
      changed.push(name);
      if (!dryRun) writeFileSync(file, result.source, 'utf8');
    }
  }

  return { scanned, changed, warnings };
}
