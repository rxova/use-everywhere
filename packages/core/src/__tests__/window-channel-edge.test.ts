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

  it('messages with no registered handler are ignored on both sides', async () => {
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

    expect(() => {
      opened.post('down', 1);
      conn.post('up', 2);
    }).not.toThrow();
    await tick();
  });

  it('a second handler for the same type joins the existing set', async () => {
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
    conn.on('down', (n) => downs.push(n));
    conn.on('down', (n) => downs.push(n * 10));
    opened.on('up', (n) => ups.push(n));
    opened.on('up', (n) => ups.push(n * 10));

    opened.post('down', 1);
    conn.post('up', 2);
    await tick();

    expect(downs).toEqual([1, 10]);
    expect(ups).toEqual([2, 20]);
  });

  it('a close after the result keeps the delivered result', async () => {
    const { opener, child } = fakeWindowPair(SHOP, PAY);
    let openedUrl = '';
    const opened = openWindow<Record<string, never>, Record<string, never>, string>(PAY_URL, {
      peerOrigin: PAY,
      localWindow: opener,
      openFn: (url) => ((openedUrl = url), child),
    });
    const conn = connectToOpener<Record<string, never>, Record<string, never>, string>({
      peerOrigin: SHOP,
      opener,
      localWindow: child,
      cid: new URL(openedUrl).searchParams.get(CID_PARAM)!,
    });
    await tick();

    conn.finish('done');
    await tick();
    child.close(); // normal flow: result first, then the window goes away
    await tick();

    await expect(opened.result).resolves.toBe('done');
    await expect(opened.closed).resolves.toBeUndefined();
  });

  it('the child drops wrong-origin, wrong-cid, and unexpected wires', async () => {
    const { opener, child } = fakeWindowPair(SHOP, PAY);
    let openedUrl = '';
    openWindow<{ down: number }, { up: number }, void>(PAY_URL, {
      peerOrigin: PAY,
      localWindow: opener,
      openFn: (url) => ((openedUrl = url), child),
    });
    const cid = new URL(openedUrl).searchParams.get(CID_PARAM)!;
    const conn = connectToOpener<{ down: number }, { up: number }, void>({
      peerOrigin: SHOP,
      opener,
      localWindow: child,
      cid,
    });
    await tick();

    const got: number[] = [];
    conn.on('down', (n) => got.push(n));

    const forged = { __ue: 1, cid, t: 'msg', type: 'down', payload: 99, msgId: 'x' };
    child.injectMessage(forged, 'https://evil.example', opener); // wrong origin
    child.injectMessage({ ...forged, cid: 'stolen' }, SHOP, opener); // wrong cid
    child.injectMessage({ __ue: 1, cid, t: 'close' }, SHOP, opener); // wire type the child ignores
    await tick();
    expect(got).toEqual([]);

    child.injectMessage(forged, SHOP, opener); // sanity: valid wire is accepted
    expect(got).toEqual([99]);
  });

  it('a child that connects after the handshake timeout cannot revive the channel', async () => {
    vi.useFakeTimers();
    const { opener, child } = fakeWindowPair(SHOP, PAY);
    let openedUrl = '';
    const opened = openWindow<{ down: number }, Record<string, never>, void>(PAY_URL, {
      peerOrigin: PAY,
      localWindow: opener,
      openFn: (url) => ((openedUrl = url), child),
      readyTimeoutMs: 1000,
    });
    const cid = new URL(openedUrl).searchParams.get(CID_PARAM)!;
    const childHeard: unknown[] = [];
    child.addEventListener('message', (event) => childHeard.push(event.data));

    opened.post('down', 1); // queued behind a handshake that will never finish

    await vi.advanceTimersByTimeAsync(1100);
    await expect(opened.ready).rejects.toBeInstanceOf(HandshakeTimeoutError);
    await expect(opened.result).rejects.toBeInstanceOf(HandshakeTimeoutError);

    // The slow child finally says ready — into a torn-down channel: no ack
    // comes back and the queued message is never flushed.
    opener.injectMessage({ __ue: 1, cid, t: 'ready' }, PAY, child);
    await vi.advanceTimersByTimeAsync(0);
    expect(childHeard).toEqual([]);

    // The close poller stayed armed, so `closed` still reports reality.
    child.closed = true;
    await vi.advanceTimersByTimeAsync(500);
    await expect(opened.closed).resolves.toBeUndefined();
  });

  it('the child ignores wires whose source is not the opener window', async () => {
    const { opener, child } = fakeWindowPair(SHOP, PAY);
    let openedUrl = '';
    openWindow<{ down: number }, { up: number }, void>(PAY_URL, {
      peerOrigin: PAY,
      localWindow: opener,
      openFn: (url) => ((openedUrl = url), child),
    });
    const cid = new URL(openedUrl).searchParams.get(CID_PARAM)!;
    const conn = connectToOpener<{ down: number }, { up: number }, void>({
      peerOrigin: SHOP,
      opener,
      localWindow: child,
      cid,
    });
    await tick();

    const got: number[] = [];
    conn.on('down', (n) => got.push(n));

    // Right origin, right cid — wrong window: another frame on the trusted
    // origin that learned the nonce must still be dropped.
    const forged = { __ue: 1, cid, t: 'msg', type: 'down', payload: 99, msgId: 'x' };
    child.injectMessage(forged, SHOP, {});
    await tick();
    expect(got).toEqual([]);

    child.injectMessage(forged, SHOP, opener); // sanity: the real opener still speaks
    expect(got).toEqual([99]);
  });

  it('the opener ignores wire types it never expects (a stray ready-ack)', async () => {
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

    opener.injectMessage({ __ue: 1, cid, t: 'ready-ack' }, PAY, child); // opener never receives these

    // channel still fully functional afterwards
    opener.injectMessage({ __ue: 1, cid, t: 'result', payload: 'ok' }, PAY, child);
    await expect(opened.result).resolves.toBe('ok');
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
