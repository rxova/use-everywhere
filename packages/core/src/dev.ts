// Same NODE_ENV strategy as dev-freeze.ts: bundlers inline the string, the
// try/catch keeps unbundled runs (where `process` is a ReferenceError) inert.

let inDev = false;
try {
  inDev = process.env.NODE_ENV !== 'production';
} catch {
  /* v8 ignore next -- defensive: only hit when run unbundled, where `process` is undefined */
}

const warned = new Set<string>();

const DOCS = 'https://rxova.github.io/use-everywhere/errors';

/**
 * Stamp a diagnostic with its code and the page that explains it.
 *
 * The code is the point. A message can be reworded, mangled by a minifier, or
 * truncated by a log aggregator; `UE1001` survives all three, and it is what
 * someone pastes into a search box or an issue. React's convention, and it
 * works there for the same reason: the console line is the short version, the
 * link is the rest of it.
 *
 * Codes are permanent, and a retired one is never reused — an old build in
 * somebody's browser is still emitting it.
 */
export function diagnostic(code: string, message: string): string {
  return `[use-everywhere] ${code}: ${message}\n  → ${DOCS}/#${code.toLowerCase()}`;
}

/**
 * Warn once per distinct message, development only. Production builds
 * dead-code-eliminate the body along with every call site's string.
 */
export function devWarn(code: string, message: string): void {
  if (!inDev) return;
  const line = diagnostic(code, message);
  if (warned.has(line)) return;
  warned.add(line);
  console.warn(line);
}
