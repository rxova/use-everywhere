// A shared store's `state` is a *shallow* Proxy: `store.state.step = 2` traps and
// broadcasts a patch, but `store.state.list.push(x)` or a same-reference mutation
// (`const [v] = useSharedState(...); v.nested = 1`) never hits the trap — it
// changes the object in place, bumps no version clock, and syncs nothing. The
// value silently diverges between tabs.
//
// To surface that class of bug the instant it happens, values are deep-frozen on
// the way into a store *in development*, so an accidental in-place mutation
// throws a TypeError right at the offending line instead of failing quietly.
// Production strips it: bundlers replace `process.env.NODE_ENV` with a literal
// and dead-code-eliminate the whole path.
//
// The read is wrapped in try/catch, not a `typeof process` guard: browser
// bundlers (Vite, webpack, Next) replace `process.env.NODE_ENV` with a string
// but do NOT provide a `process` global, so a `typeof process` check would read
// false and disable the guard in exactly the browser-dev builds it's meant for.
// The try/catch keeps it working when bundled and merely inert when the code is
// run unbundled (where `process` is a genuine ReferenceError).
// Typed locally so core needs no @types/node (it's a browser library). The
// runtime try/catch below, not this declaration, handles process being absent.
declare const process: { env: Record<string, string | undefined> };

let inDev = false;
try {
  inDev = process.env.NODE_ENV !== 'production';
} catch {
  /* v8 ignore next -- defensive: only hit when run unbundled, where `process` is undefined */
}

function deepFreeze(value: unknown): void {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return;
  // Freeze before recursing, so a reference cycle terminates at the isFrozen
  // check above instead of looping forever.
  Object.freeze(value);
  for (const key of Object.keys(value as Record<string, unknown>)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
}

/**
 * Deep-freeze a value as it enters a store — development only, a no-op in
 * production. Returns the same value for call-site convenience.
 */
export function freezeShared<T>(value: T): T {
  if (inDev) deepFreeze(value);
  return value;
}
