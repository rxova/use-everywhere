import type { WindowEventTarget, WindowLike } from '@use-everywhere/core';

type Listener = (event: { data: unknown; origin: string; source: unknown }) => void;

/**
 * One side of a fake window pair: listens like a `Window`, posts to its peer.
 *
 * Enough of the object model for `openWindow` and `connectToOpener` to run in a
 * plain test process — including the parts the cross-origin handshake exists to
 * defend: a message from the wrong origin, a message from an unrelated source,
 * a child that closes mid-flow, and a child that loads too late to hear the
 * first hello.
 */
export class FakeWindow implements WindowEventTarget, WindowLike {
  closed = false;
  origin: string;
  peer: FakeWindow | null = null;
  /** Messages wait here until `flush()` — a child that has not loaded yet. */
  pending: Array<() => void> = [];
  autoFlush = true;
  private listeners = new Map<string, Set<Listener>>();

  constructor(origin: string) {
    this.origin = origin;
  }

  addEventListener(type: string, listener: Listener): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  /** Called by the peer: deliver a message event to this window's listeners. */
  postMessage(data: unknown, targetOrigin: string): void {
    // A browser drops a message whose targetOrigin does not match, silently.
    if (targetOrigin !== '*' && targetOrigin !== this.origin) return;
    const from = this.peer;
    const deliver = (): void => {
      if (this.closed) return;
      for (const fn of this.listeners.get('message') ?? []) {
        fn({ data, origin: from?.origin ?? this.origin, source: from });
      }
    };
    if (this.autoFlush) queueMicrotask(deliver);
    else this.pending.push(deliver);
  }

  /**
   * Deliver a message that did not come from the peer — an attacker page, or an
   * unrelated widget on the same origin. The handshake must ignore it.
   */
  injectMessage(data: unknown, origin: string, source: unknown = {}): void {
    for (const fn of this.listeners.get('message') ?? []) {
      fn({ data, origin, source });
    }
  }

  /** Deliver everything held back while `autoFlush` was off. */
  flush(): void {
    for (const deliver of this.pending.splice(0)) deliver();
  }

  /** Close this window, firing `pagehide` the way a real one does. */
  close(): void {
    this.closed = true;
    for (const fn of this.listeners.get('pagehide') ?? []) {
      fn({ data: undefined, origin: this.origin, source: this });
    }
  }
}

/** Two fake windows wired to each other: the opener, and the window it opened. */
export function fakeWindowPair(
  openerOrigin: string,
  childOrigin: string,
): { opener: FakeWindow; child: FakeWindow } {
  const opener = new FakeWindow(openerOrigin);
  const child = new FakeWindow(childOrigin);
  opener.peer = child;
  child.peer = opener;
  return { opener, child };
}
