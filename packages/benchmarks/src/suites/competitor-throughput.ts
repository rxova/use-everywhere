import { BroadcastChannel as PackageChannel } from 'broadcast-channel';
import { BroadcastChannelTransport, createChannel } from '@use-everywhere/core';
import { settle, time } from '../measure.js';

/**
 * The comparison the roadmap kept deferring, and the reason it was worth
 * deferring: making it **fair** is most of the work.
 *
 * `broadcast-channel` (pubkey) is the incumbent, and it is not the same shape as
 * this library — it is a channel, with no store, no presence, and no version
 * clock. Comparing a store write against its `postMessage` would measure the
 * feature difference and call it a performance difference. So this suite
 * compares the one thing both actually do: **send a message and have another
 * client receive it.**
 *
 * Three fairness decisions, all of which change the number:
 *
 * 1. **Same primitive underneath.** `type: 'native'` pins it to the same
 *    `BroadcastChannel` this library's default transport uses. Left to itself it
 *    would pick its `node`-methods (a filesystem-backed IPC) under Node, which
 *    is a different mechanism entirely — measuring that would be measuring
 *    Node's filesystem.
 * 2. **No leader election on either side.** `createLeaderElection` is opt-in
 *    there and `createLeader` is opt-in here; neither is running.
 * 3. **Its `postMessage` is async.** It returns a promise, and awaiting each one
 *    serialises the burst into a round-trip per message, which would flatter
 *    nobody honestly. The burst is fired and then awaited together, which is
 *    what the synchronous APIs do anyway.
 *
 * What this library carries that the baseline does not: a wire envelope, a
 * client id, and a schema hook per message. That cost is the point of the
 * measurement — it should be *visible* and *small*, not zero.
 */

const MESSAGES = 5000;
const ROUNDS = 5;

let counter = 0;
const uniqueName = (prefix: string): string => `${prefix}-${(counter += 1)}`;

const perSecond = (durations: readonly number[]): number =>
  MESSAGES / (Math.min(...durations) / 1000);

export async function competitorThroughput(): Promise<{ library: number; package_: number }> {
  return { library: await libraryThroughput(), package_: await packageThroughput() };
}

async function libraryThroughput(): Promise<number> {
  const name = uniqueName('bench-vs-bc');
  const options = { transport: (bus: string) => new BroadcastChannelTransport(bus) };
  const sender = createChannel<{ tick: number }>(name, options);
  const listener = createChannel<{ tick: number }>(name, options);
  await settle();

  const durations: number[] = [];
  try {
    for (let round = 0; round < ROUNDS; round += 1) {
      let seen = 0;
      const done = new Promise<void>((resolve) => {
        const stop = listener.on('tick', () => {
          seen += 1;
          if (seen === MESSAGES) {
            stop();
            resolve();
          }
        });
      });
      durations.push(
        await time(async () => {
          for (let index = 0; index < MESSAGES; index += 1) sender.post('tick', index);
          await done;
        }),
      );
    }
  } finally {
    sender.close();
    listener.close();
  }
  return perSecond(durations);
}

async function packageThroughput(): Promise<number> {
  const name = uniqueName('bench-vs-bc-pkg');
  const sender = new PackageChannel<number>(name, { type: 'native' });
  const listener = new PackageChannel<number>(name, { type: 'native' });
  await settle();

  const durations: number[] = [];
  try {
    for (let round = 0; round < ROUNDS; round += 1) {
      let seen = 0;
      const done = new Promise<void>((resolve) => {
        listener.onmessage = () => {
          seen += 1;
          if (seen === MESSAGES) {
            listener.onmessage = null;
            resolve();
          }
        };
      });
      durations.push(
        await time(async () => {
          const posts: Promise<void>[] = [];
          for (let index = 0; index < MESSAGES; index += 1) posts.push(sender.postMessage(index));
          await Promise.all(posts);
          await done;
        }),
      );
    }
  } finally {
    await sender.close();
    await listener.close();
  }
  return perSecond(durations);
}
