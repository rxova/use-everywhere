import { BroadcastChannelTransport, createSharedStore } from '@use-everywhere/core';

/**
 * What it costs the Nth tab to join a bus that already has N-1 tabs on it.
 *
 * This is the storm. Every joiner says hello, and before the single-responder
 * election landed, *every* peer answered with a full snapshot — N tabs meant N²
 * snapshot applications, and a twentieth tab opened onto a stampede.
 *
 * Measured in **messages, not milliseconds**. The reply is deliberately delayed
 * by a jittered pause (that pause is what turns N replies into one), so wall
 * time here is dominated by a constant that would hide the very regression this
 * exists to catch. Counting the snapshots that actually land is exact, free of
 * runner noise, and is the property itself: one joiner, one snapshot, however
 * large the crowd.
 *
 * The count comes from a plain `BroadcastChannel` on the same name — everything
 * on this bus is visible to anyone who listens, which is the whole reason a bus
 * name is an identity.
 */

const KEYS = 50;
/** Long enough to cover the 40ms reply pause and its jitter, twice over. */
const JOIN_WINDOW_MS = 150;

let counter = 0;
const uniqueName = (prefix: string): string => `${prefix}-${(counter += 1)}`;

export interface StormResult {
  readonly tabs: number;
  /** Snapshots that reached the bus while one more tab joined. */
  readonly snapshots: number;
  readonly ms: number;
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Open one more tab onto a bus that already has `tabs` on it, and count the answers. */
export async function joinCost(tabs: number): Promise<StormResult> {
  const name = uniqueName('bench-storm');
  const options = { transport: (bus: string) => new BroadcastChannelTransport(bus) };
  const initial = Object.fromEntries(
    Array.from({ length: KEYS }, (_, index) => [`k${index}`, index]),
  ) as Record<string, number>;

  const crowd = Array.from({ length: tabs }, () => createSharedStore(name, initial, options));
  for (const [index, store] of crowd.entries()) store.set(`k${index % KEYS}`, index);
  await wait(JOIN_WINDOW_MS);

  const spy = new BroadcastChannel(name);
  let snapshots = 0;
  spy.addEventListener('message', (event: MessageEvent) => {
    const message = event.data as { scope?: string; type?: string };
    if (message.scope === 'state' && message.type === 'snapshot') snapshots += 1;
  });

  const started = performance.now();
  const joiner = createSharedStore(name, initial, options);
  await wait(JOIN_WINDOW_MS);
  const ms = performance.now() - started;

  spy.close();
  joiner.close();
  for (const store of crowd) store.close();

  return { tabs, snapshots, ms };
}

export async function snapshotStorm(): Promise<StormResult[]> {
  const results: StormResult[] = [];
  for (const tabs of [5, 10, 20]) results.push(await joinCost(tabs));
  return results;
}
