import { describe, expect, it } from 'vitest';
import { createChannel } from '../channel.js';
import { MemoryHub } from '../transport/memory-hub.js';
import { tick } from './helpers/tick.js';

type Messages = {
  greet: { msg: string };
  'payment-complete': { orderId: string };
};

function pair() {
  const hub = new MemoryHub();
  const options = { transport: () => hub.connect() };
  return {
    a: createChannel<Messages>('test', options),
    b: createChannel<Messages>('test', options),
  };
}

describe('createChannel', () => {
  it('routes typed messages to the right handler with sender meta', async () => {
    const { a, b } = pair();
    const greets: Array<{ msg: string }> = [];
    const payments: unknown[] = [];
    b.on('greet', (payload, meta) => {
      greets.push(payload);
      expect(meta).toEqual({ clientId: a.clientId, kind: 'worker', self: false });
    });
    b.on('payment-complete', (payload) => payments.push(payload));

    a.post('greet', { msg: 'hello' });
    await tick();

    expect(greets).toEqual([{ msg: 'hello' }]);
    expect(payments).toEqual([]);
  });

  it('does not echo posts back to the sender', async () => {
    const { a } = pair();
    const got: unknown[] = [];
    a.on('greet', (payload) => got.push(payload));

    a.post('greet', { msg: 'self' });
    await tick();

    expect(got).toEqual([]);
  });

  it('unsubscribes handlers and stops on close', async () => {
    const { a, b } = pair();
    const got: unknown[] = [];
    const off = b.on('greet', (payload) => got.push(payload));

    off();
    a.post('greet', { msg: 'one' });
    await tick();
    expect(got).toEqual([]);

    b.on('greet', (payload) => got.push(payload));
    b.close();
    a.post('greet', { msg: 'two' });
    await tick();
    expect(got).toEqual([]);
  });
});
