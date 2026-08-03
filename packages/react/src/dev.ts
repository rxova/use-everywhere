// A local twin of core's dev.ts rather than an import: core keeps this out of
// its public exports, and a development-only diagnostic is not worth widening
// a package's 1.0 API surface for. Same NODE_ENV strategy — bundlers inline the
// string, the try/catch keeps unbundled runs inert.
declare const process: { env: Record<string, string | undefined> };

let inDev = false;
try {
  inDev = process.env.NODE_ENV !== 'production';
} catch {
  /* v8 ignore next -- defensive: only hit when run unbundled, where `process` is undefined */
}

const warned = new Set<string>();

/** Warn once per distinct message, development only. */
export function devWarn(message: string): void {
  if (!inDev || warned.has(message)) return;
  warned.add(message);
  console.warn(message);
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
      `[use-everywhere] useSharedState('${key}') was called with different initial values (${String(first)} and ${String(initial)}). ` +
        'The first registration wins, so the second is ignored. Define the default once — defineStore, or a shared constant.',
    );
  }
}
