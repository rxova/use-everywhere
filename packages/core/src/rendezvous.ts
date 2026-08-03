import { devWarn } from './dev.js';
import type { SharedBusCore } from './bus.types.js';

/**
 * Where the copies of this library that are loaded on one page find each other.
 *
 * A module-scoped registry is per *bundle*, not per page. Two micro-frontends
 * that each bundled their own copy therefore each built their own bus, their own
 * clientId, and their own presence entry — so one page showed up as two tabs,
 * contended with itself for the leader seat, and could not share state within
 * itself at all (a post never loops back to the context that made it).
 *
 * The fix is a rendezvous point outside any module: a well-known symbol on
 * `globalThis`, which every copy on the page can see regardless of how it was
 * bundled. The first copy to load creates the table; the rest attach to it.
 *
 * ## Versioning, and why partition is loud
 *
 * The table holds live bus objects built by whichever copy loaded *first*, and a
 * later copy calls methods on them. That only works while the internal shape is
 * unchanged, so the symbol carries a protocol number: a copy only ever attaches
 * to a table whose shape it was compiled against.
 *
 * Incompatible copies therefore land on different symbols and simply do not see
 * each other — which is not silent breakage, it is exactly the behaviour of
 * before this existed: they still talk over BroadcastChannel as separate
 * clients. The cost is a second presence entry, and `announce()` says so in
 * development rather than leaving it to be discovered.
 */
const PROTOCOL = 1;
const TABLE = Symbol.for(`use-everywhere.rendezvous.${PROTOCOL}`);
/** Unversioned, so copies compiled against *different* protocols still meet here. */
const CENSUS = Symbol.for('use-everywhere.rendezvous.census');

interface Census {
  protocols: number[];
}

type Global = typeof globalThis & {
  [TABLE]?: Map<string, SharedBusCore>;
  [CENSUS]?: Census;
};

function announce(): void {
  const g = globalThis as Global;
  const census: Census = (g[CENSUS] ??= { protocols: [] });
  if (census.protocols.includes(PROTOCOL)) return;
  census.protocols.push(PROTOCOL);
  if (census.protocols.length > 1) {
    devWarn(
      `[use-everywhere] two incompatible versions of this library are loaded on one page ` +
        `(rendezvous protocols ${census.protocols.join(', ')}). They will not share a client ` +
        `identity: expect one presence entry per version and no synchronous delivery between ` +
        `them. They still sync over the bus. Align the versions to fix it.`,
    );
  }
}

/**
 * The page-wide bus table, created on first use.
 *
 * Deliberately not exported as a general "global registry" seam — the only
 * thing that belongs here is what must be shared to make several copies of the
 * library behave as one client.
 */
export function busTable(): Map<string, SharedBusCore> {
  announce();
  const g = globalThis as Global;
  return (g[TABLE] ??= new Map());
}

/** @internal Test seam: forget the page-wide state so a case can start clean. */
export function resetRendezvous(): void {
  const g = globalThis as Global;
  delete g[TABLE];
  delete g[CENSUS];
}
