import { createDevWarner, isDevelopment } from '@rxova/ts-utils';

// The same shared warner core uses, `createDevWarner` from @rxova/ts-utils,
// inlined at build time. React keeps its own instance rather than importing
// core's: core keeps its helpers out of its public exports, and a
// development-only diagnostic is not worth widening a package's 1.0 API surface
// for. The trailing slash keeps the link exactly as core prints it.
const warner = createDevWarner({
  prefix: 'use-everywhere',
  docsUrl: 'https://rxova.org/packages/use-everywhere/errors/',
});

/**
 * Stamp a diagnostic with its code and the page that explains it, in the same
 * format as core's.
 *
 * Codes are permanent, and a retired one is never reused: an old build in
 * somebody's browser is still emitting it. Core owns UE1xxx, this package
 * UE2xxx.
 */
export function diagnostic(code: string, message: string): string {
  return warner.format(message, code);
}

/** Warn once per distinct message, development only. */
export function devWarn(code: string, message: string): void {
  warner.warnOnce(`${code} ${message}`, message, { code });
}

/** The initial each key was first registered with. Populated only in development — dynamic keys would otherwise grow it without bound. */
const seenInitials = new Map<string, unknown>();

/**
 * Catch two callers registering one key with different defaults. The first
 * registration wins and the second is silently discarded, which is the kind of
 * disagreement that surfaces much later as "why is this value not what I set".
 */
export function warnOnInitialMismatch(storeName: string, key: string, initial: unknown): void {
  if (!isDevelopment()) return;
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
