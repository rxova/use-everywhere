import { describe, expect, it, vi } from 'vitest';
import { createChannel } from '../channel.js';
import { MemoryHub } from '../transport/memory-hub.js';
import { tick } from './helpers/tick.js';

type Requests = { ping: number; 'config:get': null };
type Replies = { 'config:get': { theme: string } };

const build = (hub: MemoryHub, name = 'cc') =>
  createChannel<Requests, Replies>(name, { transport: () => hub.connect() });

describe('post with echo', () => {
  it('delivers to this client too, so local and remote need one code path', async () => {
    const hub = new MemoryHub();
    const a = build(hub);
    const b = build(hub);
    const here: unknown[] = [];
    const there: unknown[] = [];
    a.on('ping', (n, meta) => here.push([n, meta.self]));
    b.on('ping', (n) => there.push(n));

    a.post('ping', 1, { echo: true });
    await tick();

    // Without this, a component that updates locally *and* tells everyone else
    // writes the same effect twice, in two places, which then drift.
    expect(here).toEqual([[1, true]]);
    expect(there).toEqual([1]);

    a.close();
    b.close();
  });

  it('is a no-op locally when nothing is listening here', async () => {
    const hub = new MemoryHub();
    const a = build(hub);
    const b = build(hub);
    const there: unknown[] = [];
    b.on('ping', (n) => there.push(n));

    // Echoing to nobody must not throw — a component that posts before its own
    // subscription is mounted is ordinary, not an error.
    expect(() => a.post('ping', 1, { echo: true })).not.toThrow();
    await tick();
    expect(there).toEqual([1]);

    a.close();
    b.close();
  });

  it('stays silent locally by default', async () => {
    const hub = new MemoryHub();
    const a = build(hub);
    const here: unknown[] = [];
    a.on('ping', (n) => here.push(n));

    a.post('ping', 1);
    await tick();

    // The BroadcastChannel default, unchanged: opting in is the new part.
    expect(here).toEqual([]);

    a.close();
  });
});

describe('on with once', () => {
  it('hears the first message and no more', async () => {
    const hub = new MemoryHub();
    const a = build(hub);
    const b = build(hub);
    const seen: number[] = [];
    a.on('ping', (n) => seen.push(n), { once: true });

    b.post('ping', 1);
    b.post('ping', 2);
    await tick();

    expect(seen).toEqual([1]);

    a.close();
    b.close();
  });

  it('does not skip a sibling handler while removing itself', async () => {
    const hub = new MemoryHub();
    const a = build(hub);
    const b = build(hub);
    const seen: string[] = [];
    a.on('ping', () => seen.push('once'), { once: true });
    a.on('ping', () => seen.push('always'));

    b.post('ping', 1);
    await tick();

    // A `once` handler removes itself from the set it is being iterated over,
    // which is exactly how the handler after it gets skipped.
    expect(seen).toEqual(['once', 'always']);

    a.close();
    b.close();
  });

  it('is safe to unsubscribe after it has already fired', async () => {
    const hub = new MemoryHub();
    const a = build(hub);
    const b = build(hub);
    const stop = a.on('ping', () => {}, { once: true });

    b.post('ping', 1);
    await tick();

    expect(() => stop()).not.toThrow();

    a.close();
    b.close();
  });
});

describe('ask and answer', () => {
  it('carries a reply back to the asker, and only the asker', async () => {
    const hub = new MemoryHub();
    const asker = build(hub);
    const responder = build(hub);
    const bystander = build(hub);
    const overheard: unknown[] = [];
    bystander.on('config:get', (p) => overheard.push(p));

    responder.answer('config:get', () => ({ theme: 'dark' }));

    const reply = await asker.ask('config:get', null);

    expect(reply).toEqual({ theme: 'dark' });
    // The bystander sees the question — it is a broadcast — but the answer is
    // addressed, and lands nowhere else.
    expect(overheard).toEqual([null]);

    asker.close();
    responder.close();
    bystander.close();
  });

  it('rejects when nobody answers, rather than hanging', async () => {
    vi.useFakeTimers();
    const hub = new MemoryHub();
    const asker = build(hub, 'cc-timeout');

    const pending = asker.ask('config:get', null, { timeoutMs: 50 });
    const assertion = expect(pending).rejects.toThrow(/nobody answered/);
    await vi.advanceTimersByTimeAsync(60);
    await assertion;

    asker.close();
    vi.useRealTimers();
  });

  it('gives the asker the first answer when several clients respond', async () => {
    const hub = new MemoryHub();
    const asker = build(hub, 'cc-many');
    const first = build(hub, 'cc-many');
    const second = build(hub, 'cc-many');
    first.answer('config:get', () => ({ theme: 'first' }));
    second.answer('config:get', () => ({ theme: 'second' }));

    const reply = await asker.ask('config:get', null);

    // Documented as "first wins" rather than "one of them" — gate the responder
    // on leadership when it has to be a particular tab.
    expect(['first', 'second']).toContain(reply.theme);

    asker.close();
    first.close();
    second.close();
  });

  it('lets a responder unsubscribe', async () => {
    vi.useFakeTimers();
    const hub = new MemoryHub();
    const asker = build(hub, 'cc-off');
    const responder = build(hub, 'cc-off');
    const stop = responder.answer('config:get', () => ({ theme: 'dark' }));
    stop();

    const pending = asker.ask('config:get', null, { timeoutMs: 50 });
    const assertion = expect(pending).rejects.toThrow(/nobody answered/);
    await vi.advanceTimersByTimeAsync(60);
    await assertion;

    asker.close();
    responder.close();
    vi.useRealTimers();
  });

  it('does not deliver a reply to ordinary handlers', async () => {
    const hub = new MemoryHub();
    const asker = build(hub, 'cc-quiet');
    const responder = build(hub, 'cc-quiet');
    const seen: unknown[] = [];
    asker.on('config:get', (p) => seen.push(p));
    responder.answer('config:get', () => ({ theme: 'dark' }));

    await asker.ask('config:get', null);
    await tick();

    // The reply rides the same message type; it must not look like a new
    // question to everyone subscribed to that type.
    expect(seen).toEqual([]);

    asker.close();
    responder.close();
  });

  it('surfaces a schema refusal instead of timing out', async () => {
    const hub = new MemoryHub();
    const asker = createChannel<{ ping: number }, { ping: number }>('cc-schema', {
      transport: () => hub.connect(),
      schema: {
        ping: {
          '~standard': {
            version: 1,
            vendor: 'handwritten',
            validate: () => ({ issues: [{ message: 'no' }] }),
          },
        },
      },
      onInvalid: () => {},
    });

    // The question never leaves, so waiting five seconds to be told nobody
    // answered would be the wrong error entirely.
    await expect(asker.ask('ping', 1)).rejects.toThrow(/does not match its schema/);

    asker.close();
  });
});
