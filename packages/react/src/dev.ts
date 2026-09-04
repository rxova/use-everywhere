// A local twin of core's dev.ts rather than an import: core keeps this out of
// its public exports, and a development-only diagnostic is not worth widening
// a package's 1.0 API surface for. Same NODE_ENV strategy — bundlers inline the
// string, the try/catch keeps unbundled runs inert.

let inDev = false;
try {
  inDev = process.env.NODE_ENV !== 'production';
} catch {
  /* v8 ignore next -- defensive: only hit when run unbundled, where `process` is undefined */
}

const warned = new Set<string>();

const DOCS = 'https://rxova.org/packages/use-everywhere/errors';

/**
 * Stamp a diagnostic with its code and the page that explains it. Core's twin
 * of this, for the same reason the twin of `devWarn` exists — see above.
 *
 * Codes are permanent, and a retired one is never reused: an old build in
 * somebody's browser is still emitting it. Core owns UE1xxx, this package
 * UE2xxx.
 */
export function diagnostic(code: string, message: string): string {
  return `[use-everywhere] ${code}: ${message}\n  → ${DOCS}/#${code.toLowerCase()}`;
}

/** Warn once per distinct message, development only. */
export function devWarn(code: string, message: string): void {
  if (!inDev) return;
  const line = diagnostic(code, message);
  if (warned.has(line)) return;
  warned.add(line);
  console.warn(line);
}

/** The initial each key was first registered with. Populated only in development — dynamic keys would otherwise grow it without bound. */
const seenInitials = new Map<string, unknown>();

/**
 * Catch two callers registering one key with different defaults. The first
 * registration wins and the second is silently discarded, which is the kind of
 * disagreement that surfaces much later as "why is this value not what I set".
 */
export function warnOnInitialMismatch(storeName: string, key: string, initial: unknown): void {
  if (!inDev) return;
  const id = `${storeName} ${key}`;
  if (!seenInitials.has(id)) {
    seenInitials.set(id, initial);
    return;
  }
  const first = seenInitials.get(id);
  // Reference equality is the wrong test for object initials — an inline `{}`
  // is a new reference every render — so only primitives are compared.
  const comparable = (v: unknown) => v === null || typeof v !== 'object';
  if (comparable(first) && comparable(initial) && !Object.is(first, initial)) {
    devWarn(
      'UE2001',
      `useSharedState('${key}') was called with different initial values (${String(first)} and ${String(initial)}). ` +
        'The first registration wins, so the second is ignored. Define the default once — createStoreHooks, or a shared constant.',
    );
  }
}
