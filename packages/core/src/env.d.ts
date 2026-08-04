/**
 * Just enough of `process` to write the development guard, without taking a
 * dependency on `@types/node` — only one string is ever read.
 *
 * The guard is written out literally at every call site —
 * `process.env.NODE_ENV !== 'production'` — rather than hidden behind a shared
 * constant, because a bundler can only fold what it can see. It replaces
 * `process.env.NODE_ENV` with `"production"`, the expression becomes statically
 * false, and the branch is dropped along with the warning string inside it. A
 * constant imported from another module is not reliably propagated that far,
 * and `dev-stripping.test.ts` fails if a call site is ever left unguarded.
 *
 * The cost is that a browser loading this ESM directly, with no bundler to
 * define `process`, throws a ReferenceError. A `typeof process !== 'undefined'`
 * prefix would prevent that, but esbuild does not fold it away — measured, not
 * assumed — so it would leave a dead branch in every production bundle and an
 * untestable one in coverage. Bundle the package, or shim
 * `process.env.NODE_ENV`.
 */
declare const process: { env: Record<string, string | undefined> };
