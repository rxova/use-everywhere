import { BroadcastChannelTransport, createSharedStore } from '@use-everywhere/core';
import { percentile, repeat, settle, time, type Sample } from '../measure.js';

/**
 * How long a write takes to reach every other tab, against the floor: the same
 * fan-out over a raw `BroadcastChannel` carrying nothing but the value.
 *
 * The gap is what the library charges for last-writer-wins ordering, per-key
 * version clocks, and an envelope a peer on another build can still read.
 */

const READERS = 5;
const ITERATIONS = 200;

/** A fresh name per run: registry singletons and channels both live for the process. */
let counter = 0;
const uniqueName = (prefix: string): string => `${prefix}-${(counter += 1)}`;

export async function storeLatency(): Promise<{ library: Sample[]; raw: Sample[] }> {
  return { library: await libraryLatency(), raw: await rawLatency() };
}

async function libraryLatency(): Promise<Sample[]> {
  const name = uniqueName('bench-store');
  const options = { transport: (bus: string) => new BroadcastChannelTransport(bus) };
  const writer = createSharedStore(name, { seq: 0 }, options);
  const readers = Array.from({ length: READERS }, () =>
    createSharedStore(name, { seq: 0 }, options),
  );

  // Let the hellos and the first snapshot exchange finish, so the measurement
  // is steady-state delivery rather than the join handshake.
  await settle();

  try {
    return await repeat(ITERATIONS, async (iteration) => {
      const target = iteration + 1;
      const arrived = Promise.all(
        readers.map(
          (reader) =>
            new Promise<void>((resolve) => {
              const stop = reader.subscribeKey('seq', () => {
                if (reader.getSnapshot().seq === target) {
                  stop();
                  resolve();
                }
              });
            }),
        ),
      );
      return time(async () => {
        writer.set('seq', target);
        await arrived;
      });
    });
  } finally {
    writer.close();
    for (const reader of readers) reader.close();
  }
}

async function rawLatency(): Promise<Sample[]> {
  const name = uniqueName('bench-raw-store');
  const writer = new BroadcastChannel(name);
  const readers = Array.from({ length: READERS }, () => new BroadcastChannel(name));

  try {
    return await repeat(ITERATIONS, async (iteration) => {
      const target = iteration + 1;
      const arrived = Promise.all(
        readers.map(
          (reader) =>
            new Promise<void>((resolve) => {
              const listener = (event: MessageEvent): void => {
                if ((event.data as { seq: number }).seq === target) {
                  reader.removeEventListener('message', listener);
                  resolve();
                }
              };
              reader.addEventListener('message', listener);
            }),
        ),
      );
      return time(async () => {
        writer.postMessage({ key: 'seq', seq: target });
        await arrived;
      });
    });
  } finally {
    writer.close();
    for (const reader of readers) reader.close();
  }
}

export const summarise = (samples: Sample[]): { p50: number; p95: number } => ({
  p50: percentile(samples, 50),
  p95: percentile(samples, 95),
});
