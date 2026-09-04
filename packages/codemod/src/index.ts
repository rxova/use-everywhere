/**
 * The programmatic surface of `use-everywhere-codemod`, for anyone driving the
 * transform from their own script rather than the command line.
 *
 * ```ts
 * import { transform } from 'use-everywhere-codemod';
 *
 * const { source, changed } = transform(code, 'Cart.tsx');
 * ```
 */
export { transform, RENAMES, EXTENSIONS, PACKAGE } from './transform.js';
export type { TransformResult, TransformWarning } from './transform.js';
export { run, collectFiles } from './run.js';
export type { RunOptions, RunResult, FileWarning } from './run.js';
export { main, USAGE } from './main.js';
export type { Io } from './main.js';
