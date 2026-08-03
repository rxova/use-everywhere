import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { isBusWire } from '../bus.js';
import type { BusWire } from '../bus.types.js';
import { newer } from '../clock.js';
import type { Version } from '../common.types.js';
import { createLeader } from '../leader.js';
import { createPresence } from '../presence.js';
import { createSharedStore } from '../shared-store.js';
import { MemoryHub } from '../transport/memory-hub.js';

/**
 * The example-based suites next door prove the cases we thought of. These
 * prove the cases we did not: fast-check drives arbitrary interleavings at the
 * library's core claims — convergence, one leader, an exact roster, and a bus
 * that survives being fed garbage. A counterexample is shrunk and printed with
 * its seed, so a failure here is reproducible rather than folklore.
 */

const RUNS = 200;

describe('last-writer-wins convergence', () => {
  it('is a total order: exactly one of a > b, b > a, or a === b', () => {
    const version = (): fc.Arbitrary<Version> =>
      fc.tuple(fc.integer({ min: 0, max: 6 }), fc.constantFrom('a', 'b', 'c')) as fc.Arbitrary<
        [number, string]
      >;

    fc.assert(
      fc.property(version(), version(), (a, b) => {
        const same = a[0] === b[0] && a[1] === b[1];
        // Antisymmetry is what stops two clients each keeping their own value
        // forever — the failure mode a duplicate clientId used to cause.
        expect(newer(a, b) && newer(b, a)).toBe(false);
        if (!same) expect(newer(a, b) || newer(b, a)).toBe(true);
      }),
      { numRuns: RUNS },
    );
  });

  it('is transitive, so no write can beat one that already beat it', () => {
    const version = (): fc.Arbitrary<Version> =>
      fc.tuple(fc.integer({ min: 0, max: 4 }), fc.constantFrom('a', 'b', 'c')) as fc.Arbitrary<
        [number, string]
      >;

    fc.assert(
      fc.property(version(), version(), version(), (a, b, c) => {
        if (newer(a, b) && newer(b, c)) expect(newer(a, c)).toBe(true);
      }),
      { numRuns: RUNS },
    );
  });

  it('leaves every tab holding identical state, whatever order the writes land in', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 5 }),
        fc.array(
          fc.record({
            writer: fc.nat({ max: 4 }),
            key: fc.constantFrom('a', 'b', 'c'),
            value: fc.integer({ min: 0, max: 99 }),
          }),
          { minLength: 1, maxLength: 25 },
        ),
        async (tabCount, writes) => {
          const hub = new MemoryHub();
          const tabs = Array.from({ length: tabCount }, () =>
            createSharedStore<Record<string, number>>(
              'prop',
              {},
              { transport: () => hub.connect() },
            ),
          );
          try {
            for (const { writer, key, value } of writes) {
              tabs[writer % tabCount]!.set(key, value);
              // Interleave: let some writes cross on the wire and others land
              // cleanly, instead of always draining between them.
              if (value % 3 === 0) await Promise.resolve();
            }
            // Quiesce, then every replica must agree — the whole promise.
            await new Promise((r) => setTimeout(r, 0));

            // Canonicalised: two tabs that learned the same keys in a different
            // order hold the same state, and insertion order is not part of it.
            const canonical = (snapshot: Record<string, number>) =>
              JSON.stringify(Object.entries(snapshot).sort(([a], [b]) => a.localeCompare(b)));
            const snapshots = tabs.map((t) => canonical(t.getSnapshot()));
            expect(new Set(snapshots).size).toBe(1);
          } finally {
            for (const tab of tabs) tab.close();
          }
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe('leader election safety', () => {
  it('never seats two leaders at once, under arbitrary join and leave orders', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom<'join' | 'leave' | 'wait'>('join', 'leave', 'wait'), {
          minLength: 3,
          maxLength: 14,
        }),
        async (script) => {
          vi.useFakeTimers();
          const hub = new MemoryHub();
          const live: ReturnType<typeof createLeader>[] = [];
          try {
            for (const step of script) {
              if (step === 'join') {
                live.push(
                  createLeader('prop-lead', {
                    strategy: 'heartbeat',
                    transport: () => hub.connect(),
                  }),
                );
              } else if (step === 'leave' && live.length > 0) {
                live.pop()!.close();
              }
              await vi.advanceTimersByTimeAsync(1200);

              // Safety: at most one crown, at every point in the script — not
              // merely once it has settled.
              const crowned = live.filter((l) => l.getSnapshot().isLeader);
              expect(crowned.length).toBeLessThanOrEqual(1);
            }

            // Liveness: once things go quiet, somebody leads if anybody is left.
            await vi.advanceTimersByTimeAsync(5000);
            if (live.length > 0) {
              expect(live.filter((l) => l.getSnapshot().isLeader)).toHaveLength(1);
            }
          } finally {
            for (const l of live) l.close();
            vi.useRealTimers();
          }
        },
      ),
      { numRuns: 40 },
    );
  });
});

describe('presence exactness', () => {
  it('after quiescence, the roster is exactly the other live clients', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        fc.nat({ max: 3 }),
        async (joins, leaves) => {
          vi.useFakeTimers();
          const hub = new MemoryHub();
          const all = Array.from({ length: joins }, () =>
            createPresence('prop-presence', { transport: () => hub.connect() }),
          );
          try {
            await vi.advanceTimersByTimeAsync(3000);
            const gone = all.slice(0, Math.min(leaves, all.length - 1));
            for (const p of gone) p.close();
            await vi.advanceTimersByTimeAsync(8000); // past the prune window

            const remaining = all.slice(gone.length);
            for (const p of remaining) {
              const seen = new Set(p.getPeers().map((peer) => peer.id));
              const expected = new Set(remaining.filter((o) => o !== p).map((o) => o.clientId));
              // No ghosts of the departed, and nobody live missing.
              expect([...seen].sort()).toEqual([...expected].sort());
            }
          } finally {
            for (const p of all) p.close();
            vi.useRealTimers();
          }
        },
      ),
      { numRuns: 30 },
    );
  });
});

describe('the bus survives hostile input', () => {
  it('drops anything that is not a v1 wire without throwing', () => {
    fc.assert(
      fc.property(fc.anything(), (junk) => {
        expect(() => isBusWire(junk)).not.toThrow();
        const accepted = isBusWire(junk);
        if (accepted) {
          // The only things it may accept carry the version marker.
          expect((junk as { v: unknown }).v).toBe(1);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('never corrupts a store, whatever a peer puts on the wire', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            scope: fc.constantFrom('state', 'presence', 'leader', 'event', 'nonsense'),
            type: fc.constantFrom('patch', 'hello', 'snapshot', 'ping', 'bye', 'junk'),
            key: fc.constantFrom('a', 'b'),
            value: fc.oneof(fc.integer(), fc.string(), fc.constant(null)),
            version: fc.oneof(
              fc.tuple(fc.integer({ min: 0, max: 5 }), fc.constantFrom('z')),
              fc.constant(undefined),
              fc.constant('not-a-version'),
            ),
            v: fc.constantFrom(1, 2, undefined),
          }),
          { maxLength: 20 },
        ),
        async (wires) => {
          const hub = new MemoryHub();
          const store = createSharedStore<Record<string, unknown>>(
            'prop-fuzz',
            { a: 0 },
            { transport: () => hub.connect() },
          );
          const rogue = hub.connect();
          try {
            for (const wire of wires) {
              // Deliberately ill-typed: this is what a peer running a different
              // version of the app, or a bug, actually looks like on the wire.
              rogue.post({ clientId: 'z', kind: 'tab', ...wire } as unknown as BusWire);
            }
            await new Promise((r) => setTimeout(r, 0));

            // The invariant is not "nothing changed" — a well-formed patch
            // should apply. It is that the store is still coherent afterwards.
            const snapshot = store.getSnapshot();
            const versions = store.getVersions();
            expect(() => JSON.stringify(snapshot)).not.toThrow();
            for (const key of Object.keys(versions)) {
              const version = versions[key]!;
              expect(Array.isArray(version)).toBe(true);
              expect(typeof version[0]).toBe('number');
            }
            // And it still works.
            store.set('a', 12345);
            expect(store.getSnapshot()['a']).toBe(12345);
          } finally {
            store.close();
            rogue.close();
          }
        },
      ),
      { numRuns: 40 },
    );
  });
});
