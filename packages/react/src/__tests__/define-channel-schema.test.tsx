import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BroadcastChannelTransport,
  createChannel,
  type StandardSchemaV1,
} from '@use-everywhere/core';
import { useState } from 'react';
import { defineChannel } from '../define-channel.js';

const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

type Messages = { ping: { n: number } };

/**
 * Hand-written rather than pulled from Zod: Standard Schema is a shape, not a
 * package, and building the shape by hand is what proves the seam takes any
 * implementation of it.
 */
const pingSchema: StandardSchemaV1<unknown, { n: number }> = {
  '~standard': {
    version: 1,
    vendor: 'handwritten',
    validate: (value) =>
      typeof (value as { n?: unknown } | null)?.n === 'number'
        ? { value: value as { n: number } }
        : { issues: [{ message: 'expected { n: number }' }] },
  },
};

function otherTab(name: string) {
  return createChannel<{ ping: unknown }>(name, {
    transport: (n) => new BroadcastChannelTransport(n),
  });
}

describe('defineChannel with a schema', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps a payload from another build away from the handler', async () => {
    const seen: unknown[] = [];
    const bound = defineChannel<Messages>('dcs1', {
      schema: { ping: pingSchema },
      onInvalid: () => {},
    });
    function Listener() {
      const [last, setLast] = useState<string>('none');
      bound.useMessage('ping', ({ n }) => {
        seen.push(n);
        setLast(String(n));
      });
      return <span data-testid="last">{last}</span>;
    }
    render(<Listener />);
    const peer = otherTab('dcs1');
    await flush();

    // What last week's deploy thought the shape was.
    act(() => peer.post('ping', { count: 7 }));
    await flush();
    expect(seen).toEqual([]);
    expect(screen.getByTestId('last').textContent).toBe('none');

    act(() => peer.post('ping', { n: 7 }));
    await flush();
    expect(screen.getByTestId('last').textContent).toBe('7');

    peer.close();
  });

  it('warns when a schema is declared after the channel already exists', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    defineChannel<Messages>('dcs2').get();

    defineChannel<Messages>('dcs2', { schema: { ping: pingSchema } });

    expect(warn.mock.calls[0]?.[0]).toContain("defineChannel('dcs2')");
  });

  it('treats an identical redefinition as the no-op Fast Refresh needs', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    defineChannel<Messages>('dcs3', { schema: { ping: pingSchema } }).get();

    // A hot edit rebuilds the schema object, so identity comparison would call
    // this a conflict. Which keys are validated is what would actually build a
    // different channel.
    defineChannel<Messages>('dcs3', { schema: { ping: { ...pingSchema } } });

    expect(warn).not.toHaveBeenCalled();
  });
});
