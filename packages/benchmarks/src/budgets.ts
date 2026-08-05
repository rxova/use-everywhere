import type { Budget } from './gate.js';

/**
 * What the library is allowed to cost.
 *
 * Every number is a ratio measured in the same run, so these survive a slow CI
 * runner (see gate.ts). They are set with headroom over what the suite actually
 * measures — a gate that trips on noise teaches people to ignore it — and
 * tightening one is a deliberate act, with the new measurement in the commit.
 */
export const BUDGETS: readonly Budget[] = [
  {
    metric: 'store.p50-vs-raw',
    comparison: 'at-most',
    limit: 4,
    because:
      'A write that reaches five peers should cost single-digit multiples of the same fan-out ' +
      'over a raw channel. Beyond that, something is doing work per peer that should be per post.',
  },
  {
    metric: 'store.p95-vs-raw',
    comparison: 'at-most',
    limit: 6,
    because:
      'The tail is where a per-write allocation or an O(keys) scan shows up first. It is allowed ' +
      'to be worse than the median, but not unboundedly.',
  },
  {
    metric: 'channel.throughput-vs-raw',
    comparison: 'at-least',
    limit: 0.25,
    because:
      'A burst of messages carries an envelope and a schema check per message. A quarter of raw ' +
      'throughput is the floor; below it, the per-message path grew something it should not have.',
  },
  {
    metric: 'channel.throughput-vs-package',
    comparison: 'at-least',
    limit: 0.3,
    because:
      'Against the incumbent (broadcast-channel, pinned to its native mode so both sit on the ' +
      'same primitive) this library measures around 0.43 — it sends roughly two messages for ' +
      'every five the thinner API sends, because every message carries an envelope, a client id ' +
      'and a schema hook. That is the price of a wire that also does state, presence and version ' +
      'clocks, and publishing it beats implying parity. The floor is 0.3: enough headroom for a ' +
      'loaded runner, close enough that losing another third of the throughput fails here.',
  },
  {
    metric: 'storm.snapshots-at-20',
    comparison: 'at-most',
    limit: 5,
    because:
      'One joiner, one snapshot — however large the crowd. Twenty peers answering a single hello ' +
      'is the O(K²) storm the single-responder election exists to prevent, and this is the number ' +
      'that moves the moment a peer answers unconditionally again. The suite measures two, not ' +
      'one: a genuine race lets a second reply out before the first cancels it. Five leaves room ' +
      'for that race to go badly on a loaded runner, and still fails long before twenty.',
  },
];
