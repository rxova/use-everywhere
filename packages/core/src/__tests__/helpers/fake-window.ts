import type { WindowEventTarget, WindowLike } from '../../window-channel.js';

type Listener = (event: { data: unknown; origin: string; source: unknown }) => void;

/** One side of a fake window pair: listens like a Window, posts to its peer. */
export class FakeWindow implements WindowEventTarget, WindowLike {
  closed = false;
  origin: string;
  private listeners = new Map<string, Set<Listener>>();
  peer: FakeWindow | null = null;
  /** Messages wait here until flush() — simulates a slow-loading child. */
  pending: Array<() => void> = [];
  autoFlush = true;

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
    if (targetOrigin !== '*' && targetOrigin !== this.origin) return; // browser drops it
    const from = this.peer!;
    const deliver = () => {
      if (this.closed) return;
      for (const fn of this.listeners.get('message') ?? []) {
        fn({ data, origin: from.origin, source: from });
      }
    };
    if (this.autoFlush) queueMicrotask(deliver);
    else this.pending.push(deliver);
  }

  /** Inject a message that did not come from the peer (attacker / unrelated page). */
  injectMessage(data: unknown, origin: string, source: unknown = {}): void {
    for (const fn of this.listeners.get('message') ?? []) {
      fn({ data, origin, source });
    }
  }

  flush(): void {
    for (const deliver of this.pending.splice(0)) deliver();
  }

  close(): void {
    this.closed = true;
    for (const fn of this.listeners.get('pagehide') ?? []) {
      fn({ data: undefined, origin: this.origin, source: this });
    }
  }
}

export function fakeWindowPair(openerOrigin: string, childOrigin: string) {
  const opener = new FakeWindow(openerOrigin);
  const child = new FakeWindow(childOrigin);
  opener.peer = child;
  child.peer = opener;
  return { opener, child };
}
