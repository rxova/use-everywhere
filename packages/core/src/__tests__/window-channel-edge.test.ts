import { afterEach, describe, expect, it, vi } from 'vitest';
import { HandshakeTimeoutError } from '../errors/handshake-timeout-error.js';
import { WindowClosedError } from '../errors/window-closed-error.js';
import { CID_PARAM, connectToOpener, openWindow } from '../window-channel.js';
import { fakeWindowPair } from './helpers/fake-window.js';
import { tick } from './helpers/tick.js';

const SHOP = 'http://shop.example';
const PAY = 'https://pay.example';
const PAY_URL = `${PAY}/payment`;

afterEach(() => vi.useRealTimers());

describe('window-channel edge cases', () => {
  it('the child gives up on the handshake when the opener never acks', async () => {
    vi.useFakeTimers();
    const { opener, child } = fakeWindowPair(SHOP, PAY);
    // No openWindow on the opener side: nothing will ever reply ready-ack.
    const conn = connectToOpener({
      peerOrigin: SHOP,
      opener,
      localWindow: child,
      cid: 'c1',
      readyTimeoutMs: 1000,
    });

    await vi.advanceTimersByTimeAsync(1100);

    await expect(conn.ready).rejects.toBeInstanceOf(HandshakeTimeoutError);
  });

  it("the child's close() announces itself so the opener unblocks", async () => {
    const { opener, child } = fakeWindowPair(SHOP, PAY);
    let openedUrl = '';
    const opened = openWindow(PAY_URL, {
      peerOrigin: PAY,
      localWindow: opener,
      openFn: (url) => ((openedUrl = url), child),
    });
    const conn = connectToOpener({
      peerOrigin: SHOP,
      opener,
      localWindow: child,
      cid: new URL(openedUrl).searchParams.get(CID_PARAM)!,
    });
    await tick();
    await opened.ready;

    conn.close();
    await tick();

    await expect(opened.result).rejects.toBeInstanceOf(WindowClosedError);
  });

  it('a popup-blocked handle offers inert post/on/close', async () => {
    const { opener } = fakeWindowPair(SHOP, PAY);
    const opened = openWindow(PAY_URL, {
      peerOrigin: PAY,
      localWindow: opener,
      openFn: () => null,
    });

    expect(() => {
      opened.post('anything', 1);
      opened.on('anything', () => {})();
      opened.close();
    }).not.toThrow();
    await expect(opened.result).rejects.toThrow('popup blocked');
  });

  it('allowAnyOrigin relaxes both the origin check and the target origin', async () => {
    const { opener, child } = fakeWindowPair(SHOP, PAY);
    let openedUrl = '';
    // A URL whose origin does NOT match what the child believes — allowed in dev mode.
    const opened = openWindow<{ hi: number }, { yo: number }, void>('https://cdn.example/pay', {
      peerOrigin: 'https://cdn.example',
      allowAnyOrigin: true,
      localWindow: opener,
      openFn: (url) => ((openedUrl = url), child),
    });
    const conn = connectToOpener<{ hi: number }, { yo: number }, void>({
      peerOrigin: 'https://elsewhere.example',
      allowAnyOrigin: true,
      opener,
      localWindow: child,
      cid: new URL(openedUrl).searchParams.get(CID_PARAM)!,
    });

    const got: number[] = [];
    conn.on('hi', (n) => got.push(n));
    await tick();
    await opened.ready;

    opened.post('hi', 3);
    await tick();
    expect(got).toEqual([3]);
  });

  it('on() unsubscribes handlers on both sides', async () => {
    const { opener, child } = fakeWindowPair(SHOP, PAY);
    let openedUrl = '';
    const opened = openWindow<{ down: number }, { up: number }, void>(PAY_URL, {
      peerOrigin: PAY,
      localWindow: opener,
      openFn: (url) => ((openedUrl = url), child),
    });
    const conn = connectToOpener<{ down: number }, { up: number }, void>({
      peerOrigin: SHOP,
      opener,
      localWindow: child,
      cid: new URL(openedUrl).searchParams.get(CID_PARAM)!,
    });
    await tick();

    const downs: number[] = [];
    const ups: number[] = [];
    conn.on('down', (n) => downs.push(n))();
    opened.on('up', (n) => ups.push(n))();

    opened.post('down', 1);
    conn.post('up', 2);
    await tick();

    expect(downs).toEqual([]);
    expect(ups).toEqual([]);
  });

  it('stays settled when close signals arrive twice', async () => {
    const { opener, child } = fakeWindowPair(SHOP, PAY);
    let openedUrl = '';
    const opened = openWindow(PAY_URL, {
      peerOrigin: PAY,
      localWindow: opener,
      openFn: (url) => ((openedUrl = url), child),
    });
    const cid = new URL(openedUrl).searchParams.get(CID_PARAM)!;
    connectToOpener({ peerOrigin: SHOP, opener, localWindow: child, cid });
    await tick();

    opener.injectMessage({ __ue: 1, cid, t: 'close' }, PAY, child);
    opener.injectMessage({ __ue: 1, cid, t: 'close' }, PAY, child); // re-entry guard

    await expect(opened.result).rejects.toBeInstanceOf(WindowClosedError);
    await expect(opened.closed).resolves.toBeUndefined();
  });

  it('the ready timeout and close poller are harmless after a completed handshake', async () => {
    vi.useFakeTimers();
    const { opener, child } = fakeWindowPair(SHOP, PAY);
    let openedUrl = '';
    const opened = openWindow<Record<string, never>, Record<string, never>, string>(PAY_URL, {
      peerOrigin: PAY,
      localWindow: opener,
      openFn: (url) => ((openedUrl = url), child),
      readyTimeoutMs: 1000,
    });
    const conn = connectToOpener<Record<string, never>, Record<string, never>, string>({
      peerOrigin: SHOP,
      opener,
      localWindow: child,
      cid: new URL(openedUrl).searchParams.get(CID_PARAM)!,
    });
    await vi.advanceTimersByTimeAsync(0);
    await opened.ready;

    await vi.advanceTimersByTimeAsync(5000); // poller ticks + stale ready timer fire

    conn.finish('still fine');
    await vi.advanceTimersByTimeAsync(0);
    await expect(opened.result).resolves.toBe('still fine');
  });

  it('ignores duplicate results and re-acks duplicate readies', async () => {
    const { opener, child } = fakeWindowPair(SHOP, PAY);
    let openedUrl = '';
    const opened = openWindow<Record<string, never>, Record<string, never>, string>(PAY_URL, {
      peerOrigin: PAY,
      localWindow: opener,
      openFn: (url) => ((openedUrl = url), child),
    });
    const cid = new URL(openedUrl).searchParams.get(CID_PARAM)!;
    connectToOpener({ peerOrigin: SHOP, opener, localWindow: child, cid });
    await tick();

    // A second ready (e.g. a retry in flight when the ack landed) is re-acked, not fatal.
    opener.injectMessage({ __ue: 1, cid, t: 'ready' }, PAY, child);
    opener.injectMessage({ __ue: 1, cid, t: 'result', payload: 'first' }, PAY, child);
    opener.injectMessage({ __ue: 1, cid, t: 'result', payload: 'second' }, PAY, child);

    await expect(opened.result).resolves.toBe('first');
  });
});
