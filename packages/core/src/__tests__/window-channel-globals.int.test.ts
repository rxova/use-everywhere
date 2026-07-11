// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CID_PARAM, connectToOpener, openWindow } from '../window-channel.js';
import { FakeWindow, fakeWindowPair } from './helpers/fake-window.js';

/**
 * Exercises the no-test-seam fallbacks: window.open, window.opener,
 * the global message listeners, and cid extraction from location.search.
 */
describe('window-channel global fallbacks (happy-dom)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('openWindow falls back to window.open and resolves relative URLs against location', () => {
    const { child } = fakeWindowPair(location.origin, location.origin);
    const openSpy = vi
      .spyOn(window, 'open')
      .mockReturnValue(child as unknown as ReturnType<typeof window.open>);

    const opened = openWindow('/payment', { peerOrigin: location.origin });

    expect(openSpy).toHaveBeenCalledOnce();
    const openedUrl = openSpy.mock.calls[0]![0] as string;
    expect(new URL(openedUrl).searchParams.get(CID_PARAM)).toBeTruthy();
    expect(opened.window).toBe(child);
    opened.close();
  });

  it('connectToOpener falls back to window.opener, location cid, and window.close', () => {
    const openerWindow = new FakeWindow('http://shop.example');
    openerWindow.peer = new FakeWindow(location.origin);
    (window as { opener: unknown }).opener = openerWindow;
    history.replaceState(null, '', `/pay?${CID_PARAM}=abc123`);
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {});

    const conn = connectToOpener({ peerOrigin: 'http://shop.example' });
    conn.close();

    expect(closeSpy).toHaveBeenCalledOnce();
    (window as { opener: unknown }).opener = null;
  });
});
