import { afterEach, describe, expect, it, vi } from 'vitest';
import { HandshakeTimeoutError } from '../errors/handshake-timeout-error.js';
import { WindowClosedError } from '../errors/window-closed-error.js';
import { CID_PARAM, connectToOpener, openWindow } from '../window-channel.js';
import { FakeWindow, fakeWindowPair } from './helpers/fake-window.js';
import { tick } from './helpers/tick.js';

const SHOP = 'http://shop.example';
const PAY = 'https://pay.example';
const PAY_URL = `${PAY}/payment`;

type ToChild = { 'order-details': { orderId: string; amount: number } };
type ToOpener = { progress: { step: string } };
type Result = { receiptId: string };

function setup() {
  const { opener, child } = fakeWindowPair(SHOP, PAY);
  let openedUrl = '';
  const opened = openWindow<ToChild, ToOpener, Result>(PAY_URL, {
    peerOrigin: PAY,
    localWindow: opener,
    openFn: (url) => ((openedUrl = url), child),
  });
  const cid = new URL(openedUrl).searchParams.get(CID_PARAM)!;
  const connect = () =>
    connectToOpener<ToChild, ToOpener, Result>({
      peerOrigin: SHOP,
      opener,
      localWindow: child,
      cid,
    });
  return { opener, child, opened, cid, connect };
}

afterEach(() => vi.useRealTimers());

describe('openWindow + connectToOpener', () => {
  it('completes the ready handshake and exchanges typed messages both ways', async () => {
    const { opened, connect } = setup();
    const conn = connect();
    const childGot: unknown[] = [];
    const openerGot: unknown[] = [];
    conn.on('order-details', (payload) => childGot.push(payload));
    opened.on('progress', (payload) => openerGot.push(payload));

    await tick();
    await expect(opened.ready).resolves.toBeUndefined();
    await expect(conn.ready).resolves.toBeUndefined();

    opened.post('order-details', { orderId: '48-291', amount: 6903 });
    conn.post('progress', { step: 'card-entered' });
    await tick();

    expect(childGot).toEqual([{ orderId: '48-291', amount: 6903 }]);
    expect(openerGot).toEqual([{ step: 'card-entered' }]);
  });

  it('queues messages posted before the handshake — a slow child loses nothing', async () => {
    const { opened, connect } = setup();
    opened.post('order-details', { orderId: 'early', amount: 1 });

    await tick(); // child "still loading": nothing sent, nothing lost
    const conn = connect();
    const childGot: unknown[] = [];
    conn.on('order-details', (payload) => childGot.push(payload));
    await tick();

    expect(childGot).toEqual([{ orderId: 'early', amount: 1 }]);
  });

  it('delivers the child result to the opener', async () => {
    const { opened, connect } = setup();
    const conn = connect();
    conn.finish({ receiptId: 'r-777' });
    await tick();

    await expect(opened.result).resolves.toEqual({ receiptId: 'r-777' });
  });

  it('rejects result with WindowClosedError when the child closes early', async () => {
    const { opened, child, connect } = setup();
    connect();
    await tick();

    child.close(); // fires pagehide → child announces close
    await tick();

    await expect(opened.result).rejects.toBeInstanceOf(WindowClosedError);
    await expect(opened.closed).resolves.toBeUndefined();
  });

  it('drops messages from the wrong origin, wrong cid, or wrong source', async () => {
    const { opener, child, opened, cid, connect } = setup();
    connect();
    await tick();
    const openerGot: unknown[] = [];
    opened.on('progress', (payload) => openerGot.push(payload));

    const forged = {
      __ue: 1,
      cid,
      t: 'msg',
      type: 'progress',
      payload: { step: 'evil' },
      msgId: 'x',
    };
    opener.injectMessage(forged, 'https://evil.example', child); // wrong origin
    opener.injectMessage({ ...forged, cid: 'stolen' }, PAY, child); // wrong cid
    opener.injectMessage(forged, PAY, {}); // wrong source window
    await tick();

    expect(openerGot).toEqual([]);

    // Sanity: the same wire from the true origin+source is accepted.
    opener.injectMessage(forged, PAY, child);
    expect(openerGot).toEqual([{ step: 'evil' }]);
  });

  it('rejects ready and result when the popup is blocked', async () => {
    const { opener } = fakeWindowPair(SHOP, PAY);
    const opened = openWindow(PAY_URL, {
      peerOrigin: PAY,
      localWindow: opener,
      openFn: () => null,
    });

    expect(opened.window).toBeNull();
    await expect(opened.ready).rejects.toThrow('popup blocked');
    await expect(opened.result).rejects.toThrow('popup blocked');
  });

  it('times out the handshake when the child never connects', async () => {
    vi.useFakeTimers();
    const { opener, child } = fakeWindowPair(SHOP, PAY);
    const opened = openWindow(PAY_URL, {
      peerOrigin: PAY,
      localWindow: opener,
      openFn: () => child,
      readyTimeoutMs: 1000,
    });

    await vi.advanceTimersByTimeAsync(1100);

    await expect(opened.ready).rejects.toBeInstanceOf(HandshakeTimeoutError);
    await expect(opened.result).rejects.toBeInstanceOf(HandshakeTimeoutError);
  });

  it('detects a silently closed child via polling', async () => {
    vi.useFakeTimers();
    const { opener, child } = fakeWindowPair(SHOP, PAY);
    const opened = openWindow(PAY_URL, {
      peerOrigin: PAY,
      localWindow: opener,
      openFn: () => child,
    });

    child.closed = true; // closed without any pagehide signal (e.g. crashed)
    await vi.advanceTimersByTimeAsync(500);

    await expect(opened.result).rejects.toBeInstanceOf(WindowClosedError);
    await expect(opened.closed).resolves.toBeUndefined();
  });

  it('refuses peerOrigin "*" and mismatched url origins', () => {
    const { opener, child } = fakeWindowPair(SHOP, PAY);
    const seams = { localWindow: opener, openFn: () => child };

    expect(() => openWindow(PAY_URL, { peerOrigin: '*', ...seams })).toThrow(/unsafe/);
    expect(() => openWindow(PAY_URL, { peerOrigin: 'https://other.example', ...seams })).toThrow(
      /does not match/,
    );
  });

  it('connectToOpener throws without an opener or without a cid', () => {
    const child = new FakeWindow(PAY);
    expect(() => connectToOpener({ peerOrigin: SHOP, opener: null, localWindow: child })).toThrow(
      /no window.opener/,
    );

    expect(() =>
      connectToOpener({ peerOrigin: SHOP, opener: new FakeWindow(SHOP), localWindow: child }),
    ).toThrow(new RegExp(CID_PARAM));
  });
});
