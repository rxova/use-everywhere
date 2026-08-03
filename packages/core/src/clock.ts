import type { Version } from './common.types.js';

/** Is `a` newer than `b`? Last-writer-wins; equal counters break ties by clientId. */
export function newer(a: Version, b: Version | undefined): boolean {
  return !b || a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);
}

/**
 * @internal Is this actually a version clock?
 *
 * Types stop at the module boundary; the wire is the one place a value's shape
 * is a claim rather than a guarantee. A peer running last week's deploy — or a
 * buggy script on the same origin — can put anything in a `version` field, and
 * `newer()` indexing a string or undefined throws inside the receiving tab's
 * message handler, where nothing catches it.
 */
export function isVersion(value: unknown): value is Version {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    Number.isFinite(value[0]) &&
    typeof value[1] === 'string'
  );
}
