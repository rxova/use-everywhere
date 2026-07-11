import type { Version } from './common.types.js';

/** Is `a` newer than `b`? Last-writer-wins; equal counters break ties by clientId. */
export function newer(a: Version, b: Version | undefined): boolean {
  return !b || a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);
}
