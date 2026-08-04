import type { BusWire } from './bus.types.js';
import { devWarn } from './dev.js';
import { skewLedger } from './rendezvous.js';

/**
 * The wire protocol this build speaks. Stamped as `v` on everything posted, and
 * required to match on everything received.
 *
 * ## The compatibility contract
 *
 * Every rolling deploy produces version skew: a tab opened this morning is
 * still running last week's bundle while the tab opened after lunch is running
 * today's, and both are on the same origin talking over the same bus. The
 * contract that makes that safe has two halves.
 *
 * **Across versions, partition — loudly.** A wire whose `v` is not this one is
 * dropped rather than guessed at, because the only thing a build knows about
 * another protocol version is that it does not know it. Dropping alone would be
 * the silent-degradation failure this library exists to avoid, so a foreign
 * version is also recorded on the page ({@link getWireSkew}) and warned about
 * once in development. The two builds still each work, still each sync with
 * their own generation, and the fact that they cannot see each other is
 * *observable* rather than something to be discovered from a bug report.
 *
 * **Within a version, evolve additively.** A new `type` on an existing `scope`
 * may be added without bumping `v`, on one condition: every engine dispatches
 * on the types it knows and ignores the rest. A build that has never heard of
 * `state`/`remove` must treat it as nothing, not as a malformed something —
 * which is why no dispatch here ends in a bare `else`. New *fields* on an
 * existing type follow the same rule: readers must tolerate their absence,
 * because half the tabs on the origin were built before the field existed.
 *
 * Bump `v` only for a change that breaks those rules — a field whose meaning
 * changes, a type that stops being sent, a value that stops being comparable.
 * Bumping is not a failure; it is the honest signal, and it is cheap because
 * the generations partition cleanly instead of corrupting each other.
 */
export const WIRE_VERSION = 1;

type Envelope = { v?: unknown; scope?: unknown; type?: unknown; clientId?: unknown };

/**
 * The three fields every branch downstream reads unconditionally, whatever the
 * version says. The envelope is the only place a wire's shape is ever verified,
 * and everything past it treats the wire as typed.
 */
function hasEnvelopeShape(wire: Envelope): boolean {
  return (
    typeof wire.scope === 'string' &&
    typeof wire.type === 'string' &&
    typeof wire.clientId === 'string'
  );
}

export function isBusWire(data: unknown): data is BusWire {
  if (typeof data !== 'object' || data === null) return false;
  const wire = data as Envelope;
  return wire.v === WIRE_VERSION && hasEnvelopeShape(wire);
}

/**
 * The protocol version of a wire that is recognisably ours but not ours to
 * read, or `null` for anything else.
 *
 * Deliberately stricter than "has a `v` we don't know": a bus name is just a
 * `BroadcastChannel` name, and any other script on the origin may be using the
 * same one for its own traffic. Requiring the full envelope shape — numeric
 * `v`, string `scope`/`type`/`clientId` — before calling something a skewed
 * peer keeps an unrelated neighbour from being reported as a stale deploy.
 */
export function foreignWireVersion(data: unknown): number | null {
  if (typeof data !== 'object' || data === null) return null;
  const wire = data as Envelope;
  if (typeof wire.v !== 'number' || wire.v === WIRE_VERSION) return null;
  return hasEnvelopeShape(wire) ? wire.v : null;
}

/** @internal Note a peer speaking another protocol, and say so once in development. */
export function recordSkew(name: string, version: number): void {
  const seen = skewLedger();
  const versions = seen.get(name) ?? new Set<number>();
  seen.set(name, versions);
  if (versions.has(version)) return;
  versions.add(version);
  // Terse on purpose, with the explanation behind a link. The NODE_ENV guard
  // around the call keeps it out of production bundles entirely; see env.d.ts.
  if (process.env.NODE_ENV !== 'production') {
    devWarn(
      'UE1007',
      `bus "${name}": a peer speaks wire protocol v${version}, this build speaks ` +
        `v${WIRE_VERSION} — a ${version > WIRE_VERSION ? 'newer' : 'older'} deploy. They cannot ` +
        `share state, presence, or a leader seat. https://rxova.org/packages/use-everywhere/under-the-hood/version-skew/`,
    );
  }
}

/**
 * Which foreign wire protocol versions have been heard on a bus, ascending.
 *
 * Empty means every peer seen so far speaks {@link WIRE_VERSION} — the normal
 * case, and the one a deploy should return to once the last stale tab is gone.
 * A non-empty result means this page is mid-skew and is partitioned from those
 * peers by design: gate a "reload for the latest version" prompt on it rather
 * than letting users work in a tab that silently sees half the picture.
 *
 * Page-wide and cumulative, like the skew it reports. It counts what was heard,
 * not what is still out there, so it never un-reports a version — a stale tab
 * that closes leaves its mark, because the deploy that produced it happened.
 */
export function getWireSkew(name: string): number[] {
  return [...(skewLedger().get(name) ?? [])].sort((a, b) => a - b);
}
