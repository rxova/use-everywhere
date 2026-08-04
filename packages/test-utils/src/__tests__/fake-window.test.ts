import { describe, expect, it, vi } from 'vitest';
import { FakeWindow, fakeWindowPair } from '../fake-window.js';
import { tick } from '../timing.js';

describe('FakeWindow', () => {
  it('delivers a message to the peer, tagged with the sender origin', async () => {
    const { opener, child } = fakeWindowPair('https://shop.test', 'https://pay.test');
    const heard = vi.fn();
    child.addEventListener('message', heard);

    child.postMessage({ hello: true }, 'https://pay.test');
    await tick();

    expect(heard).toHaveBeenCalledWith({
      data: { hello: true },
      origin: 'https://shop.test',
      source: opener,
    });
  });

  it('drops a message addressed to another origin, the way a browser does', async () => {
    const { child } = fakeWindowPair('https://shop.test', 'https://pay.test');
    const heard = vi.fn();
    child.addEventListener('message', heard);

    child.postMessage({ hello: true }, 'https://attacker.test');
    await tick();

    expect(heard).not.toHaveBeenCalled();
  });

  it('accepts a wildcard target origin', async () => {
    const { child } = fakeWindowPair('https://shop.test', 'https://pay.test');
    const heard = vi.fn();
    child.addEventListener('message', heard);

    child.postMessage({ hello: true }, '*');
    await tick();

    expect(heard).toHaveBeenCalled();
  });

  it('holds messages until flush, for a child that has not loaded yet', async () => {
    const { child } = fakeWindowPair('https://shop.test', 'https://pay.test');
    const heard = vi.fn();
    child.addEventListener('message', heard);
    child.autoFlush = false;

    child.postMessage({ hello: true }, '*');
    await tick();
    expect(heard).not.toHaveBeenCalled();

    child.flush();
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('delivers nothing to a window that closed while the message was in flight', async () => {
    const { child } = fakeWindowPair('https://shop.test', 'https://pay.test');
    const heard = vi.fn();
    child.addEventListener('message', heard);

    child.postMessage({ hello: true }, '*');
    child.close();
    await tick();

    expect(heard).not.toHaveBeenCalled();
  });

  it('fires pagehide on close, and reports itself closed', () => {
    const window = new FakeWindow('https://pay.test');
    const bye = vi.fn();
    window.addEventListener('pagehide', bye);

    window.close();

    expect(bye).toHaveBeenCalledTimes(1);
    expect(window.closed).toBe(true);
  });

  it('injects a message from an unrelated source, for the checks that must ignore it', () => {
    const window = new FakeWindow('https://shop.test');
    const heard = vi.fn();
    window.addEventListener('message', heard);

    window.injectMessage({ evil: true }, 'https://attacker.test');

    expect(heard).toHaveBeenCalledWith({
      data: { evil: true },
      origin: 'https://attacker.test',
      source: {},
    });
  });

  it('stops delivering once a listener is removed', async () => {
    const { child } = fakeWindowPair('https://shop.test', 'https://pay.test');
    const heard = vi.fn();
    child.addEventListener('message', heard);
    child.addEventListener('message', () => {});
    child.removeEventListener('message', heard);

    child.postMessage({ hello: true }, '*');
    await tick();

    expect(heard).not.toHaveBeenCalled();
  });

  it('says nothing to a window nobody is listening to', async () => {
    const { child } = fakeWindowPair('https://shop.test', 'https://pay.test');

    child.postMessage({ hello: true }, '*');
    child.injectMessage({ hello: true }, 'https://attacker.test');

    await expect(tick()).resolves.toBeUndefined();
  });

  it('has no peer to name when it stands alone', async () => {
    const lonely = new FakeWindow('https://shop.test');
    const heard = vi.fn();
    lonely.addEventListener('message', heard);

    lonely.postMessage({ hello: true }, 'https://shop.test');
    await tick();

    expect(heard).toHaveBeenCalledWith(
      expect.objectContaining({ origin: 'https://shop.test', source: null }),
    );
  });
});
