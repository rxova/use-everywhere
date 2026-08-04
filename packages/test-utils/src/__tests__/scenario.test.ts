import { describe, expect, it } from 'vitest';
import { createScenario } from '../scenario.js';
import { snapshotWindow } from '../timing.js';

describe('createScenario', () => {
  it('carries a write from one tab to another', async () => {
    const browser = createScenario();
    const a = browser.tab().store('cart', { items: 0 });
    const b = browser.tab().store('cart', { items: 0 });

    a.set('items', 3);
    await browser.settle();

    expect(b.getSnapshot().items).toBe(3);
    browser.dispose();
  });

  it('keeps two scenarios from hearing each other', async () => {
    const one = createScenario();
    const other = createScenario();
    const a = one.tab().store('cart', { items: 0 });
    const b = other.tab().store('cart', { items: 0 });

    a.set('items', 3);
    await one.settle();

    expect(b.getSnapshot().items).toBe(0);
    one.dispose();
    other.dispose();
  });

  it('names tabs in the order they were opened, and lets you name them yourself', () => {
    const browser = createScenario();
    expect(browser.tab().id).toBe('tab-1');
    expect(browser.tab().id).toBe('tab-2');
    expect(browser.tab({ id: 'checkout' }).id).toBe('checkout');
    expect(browser.tabs).toHaveLength(3);
    browser.dispose();
  });

  it('announces the kind a tab was opened with', async () => {
    const browser = createScenario();
    const worker = browser.tab({ kind: 'worker' });
    worker.presence('app');
    const watcher = browser.tab().presence('app');

    await snapshotWindow();

    expect(watcher.getPeers().map((peer) => peer.kind)).toEqual(['worker']);
    browser.dispose();
  });

  it('drops a closed tab from the roster at once', async () => {
    const browser = createScenario();
    const a = browser.tab();
    a.presence('app');
    const watcher = browser.tab().presence('app');

    await snapshotWindow();
    expect(watcher.getPeers()).toHaveLength(1);

    a.close();
    await browser.settle();

    expect(watcher.getPeers()).toHaveLength(0);
    expect(a.gone).toBe(true);
    browser.dispose();
  });

  it('leaves a crashed tab in the roster: nobody was told', async () => {
    const browser = createScenario();
    const a = browser.tab();
    a.presence('app');
    const watcher = browser.tab().presence('app');

    await snapshotWindow();
    a.crash();
    await browser.settle();

    // The whole difference between close() and crash(): peers have to notice.
    expect(watcher.getPeers()).toHaveLength(1);
    expect(a.gone).toBe(true);
    browser.dispose();
  });

  it('stops a crashed tab from writing, and from hearing', async () => {
    const browser = createScenario();
    const a = browser.tab();
    const b = browser.tab();
    const cartA = a.store('cart', { items: 0 });
    const cartB = b.store('cart', { items: 0 });

    a.crash();
    cartA.set('items', 3);
    cartB.set('items', 7);
    await browser.settle();

    expect(cartB.getSnapshot().items).toBe(7);
    expect(cartA.getSnapshot().items).toBe(3);
    browser.dispose();
  });

  it('ignores a second close, and a close after a crash', () => {
    const browser = createScenario();
    const a = browser.tab();
    a.store('cart', { items: 0 });

    a.close();
    expect(() => a.close()).not.toThrow();

    const b = browser.tab();
    b.store('cart', { items: 0 });
    b.crash();
    expect(() => b.close()).not.toThrow();
    expect(() => b.crash()).not.toThrow();

    browser.dispose();
  });

  it('gives every primitive the tab wire, so a crash cuts all of them', async () => {
    const browser = createScenario();
    const a = browser.tab();
    const chat = a.channel<{ ping: number }>('chat');
    const votes = a.reducer<{ total: number }, number>(
      'votes',
      (state, action) => ({ total: state.total + action }),
      { total: 0 },
    );
    const listener = browser.tab().channel<{ ping: number }>('chat');

    const heard: number[] = [];
    listener.on('ping', (payload) => heard.push(payload));

    chat.post('ping', 1);
    await browser.settle();
    expect(heard).toEqual([1]);

    a.crash();
    chat.post('ping', 2);
    votes.dispatch(1);
    await browser.settle();

    expect(heard).toEqual([1]);
    browser.dispose();
  });

  it('waits on a timer when asked, for the things that are on one', async () => {
    const browser = createScenario();
    const first = browser.tab().store('cart', { items: 0 });
    first.set('items', 5);

    // A late joiner is answered after a jittered pause, not on a microtask.
    const late = browser.tab().store('cart', { items: 0 });
    await browser.settle(80);

    expect(late.getSnapshot().items).toBe(5);
    browser.dispose();
  });
});
