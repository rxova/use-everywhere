// Same NODE_ENV strategy as dev-freeze.ts: bundlers inline the string, the
// try/catch keeps unbundled runs (where `process` is a ReferenceError) inert.

let inDev = false;
try {
  inDev = process.env.NODE_ENV !== 'production';
} catch {
  /* v8 ignore next -- defensive: only hit when run unbundled, where `process` is undefined */
}

const warned = new Set<string>();

/**
 * Warn once per distinct message, development only. Production builds
 * dead-code-eliminate the body along with every call site's string.
 */
export function devWarn(message: string): void {
  if (!inDev || warned.has(message)) return;
  warned.add(message);
  console.warn(message);
}
