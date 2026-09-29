import { createDevWarner } from "@rxova/ts-utils";

// The warner is `createDevWarner` from @rxova/ts-utils, inlined at build time
// like `deepFreeze` in dev-freeze.ts. It reads `isDevelopment()` on every call:
// a boolean `__DEV__` global wins, otherwise anything but
// `NODE_ENV=production` is development, and unbundled runs (where `process` is
// a ReferenceError) stay inert.
//
// The trailing slash keeps the link exactly as before: `…/errors/#ue1001`.
const warner = createDevWarner({
  prefix: "use-everywhere",
  docsUrl: "https://rxova.org/packages/use-everywhere/errors/",
});

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
  return warner.format(message, code);
}

/**
 * Warn once per distinct message, development only. Production builds
 * dead-code-eliminate every call site's string: each call sits under a literal
 * `process.env.NODE_ENV !== 'production'` guard.
 */
export function devWarn(code: string, message: string): void {
  warner.warnOnce(`${code} ${message}`, message, { code });
}
