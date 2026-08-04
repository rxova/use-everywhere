import { BroadcastChannelTransport, createChannel } from '@use-everywhere/core';
import { settle, time } from '../measure.js';

/**
 * Messages per second through one channel to one listener, against the same
 * floor: a raw `BroadcastChannel` carrying the payload alone.
 *
 * Throughput rather than latency, because this is what a burst costs — a drag
 * that posts a cursor position on every mouse move, a log that mirrors lines
 * into a second tab.
 */

const MESSAGES = 5000;
const ROUNDS = 5;

let counter = 0;
const uniqueName = (prefix: string): string => `${prefix}-${(counter += 1)}`;

export async function channelThroughput(): Promise<{ library: number; raw: number }> {
  return { library: await libraryThroughput(), raw: await rawThroughput() };
}

/** Messages per second, taking the best of `ROUNDS` — the least noisy estimate. */
const perSecond = (durations: readonly number[]): number =>
  MESSAGES / (Math.min(...durations) / 1000);

async function libraryThroughput(): Promise<number> {
  const name = uniqueName('bench-channel');
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

async function rawThroughput(): Promise<number> {
  const name = uniqueName('bench-raw-channel');
  const sender = new BroadcastChannel(name);
  const listener = new BroadcastChannel(name);

  const durations: number[] = [];
  try {
    for (let round = 0; round < ROUNDS; round += 1) {
      let seen = 0;
      const done = new Promise<void>((resolve) => {
        const onMessage = (): void => {
          seen += 1;
          if (seen === MESSAGES) {
            listener.removeEventListener('message', onMessage);
            resolve();
          }
        };
        listener.addEventListener('message', onMessage);
      });
      durations.push(
        await time(async () => {
          for (let index = 0; index < MESSAGES; index += 1) sender.postMessage({ tick: index });
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
