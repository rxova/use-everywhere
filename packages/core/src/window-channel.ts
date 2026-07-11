import type { MessageMap } from './common.types.js';
import { HandshakeTimeoutError } from './errors/handshake-timeout-error.js';
import { WindowClosedError } from './errors/window-closed-error.js';
import { newMsgId } from './ids.js';
import type {
  ConnectToOpenerOptions,
  MessageEventLike,
  OpenedWindow,
  OpenerConnection,
  OpenWindowOptions,
  WindowEventTarget,
  WindowLike,
  WindowWire,
} from './window-channel.types.js';

export const CID_PARAM = 'ue-cid';

function isWindowWire(data: unknown, cid: string): data is WindowWire {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { __ue?: unknown }).__ue === 1 &&
    (data as { cid?: unknown }).cid === cid
  );
}

function validatePeerOrigin(peerOrigin: string, allowAnyOrigin: boolean | undefined): void {
  if (peerOrigin === '*' && !allowAnyOrigin) {
    throw new Error(
      "peerOrigin '*' is unsafe: any page could read your messages. " +
        'Pass the exact origin, or set allowAnyOrigin: true (dev only).',
    );
  }
}

/** Swallow rejections we surface through promises the caller may not await. */
function markHandled(promise: Promise<unknown>): void {
  promise.catch(() => {});
}

/**
 * Open a window (possibly on another origin) and get a typed 1:1 channel to it.
 * The child must call connectToOpener(). Every received message is validated:
 * event.origin, envelope brand, per-connection nonce, and event.source.
 */
export function openWindow<Out extends MessageMap, In extends MessageMap, R = unknown>(
  url: string | URL,
  options: OpenWindowOptions,
): OpenedWindow<Out, In, R> {
  const { peerOrigin, allowAnyOrigin } = options;
  validatePeerOrigin(peerOrigin, allowAnyOrigin);

  const base = typeof location !== 'undefined' ? location.href : undefined;
  const resolved = new URL(url, base);
  if (!allowAnyOrigin && resolved.origin !== peerOrigin) {
    throw new Error(`url origin ${resolved.origin} does not match peerOrigin ${peerOrigin}`);
  }
  const cid = newMsgId();
  resolved.searchParams.set(CID_PARAM, cid);

  const localWindow = options.localWindow ?? (window as unknown as WindowEventTarget);
  const openFn =
    options.openFn ??
    ((u: string, target: string, features?: string) => window.open(u, target, features));
  const targetOrigin = allowAnyOrigin ? '*' : peerOrigin;

  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  const outQueue: WindowWire[] = [];
  let isReady = false;
  let resultSettled = false;
  let closedSettled = false;

  let resolveReady!: () => void;
  let rejectReady!: (err: unknown) => void;
  const ready = new Promise<void>((res, rej) => ((resolveReady = res), (rejectReady = rej)));
  let resolveResult!: (value: R) => void;
  let rejectResult!: (err: unknown) => void;
  const result = new Promise<R>((res, rej) => ((resolveResult = res), (rejectResult = rej)));
  let resolveClosed!: () => void;
  const closed = new Promise<void>((res) => (resolveClosed = res));
  markHandled(ready);
  markHandled(result);

  // Listener must be attached before the child can possibly load.
  const onMessage = (event: MessageEventLike) => {
    if (!allowAnyOrigin && event.origin !== peerOrigin) return;
    if (!isWindowWire(event.data, cid)) return;
    if (childWindow && event.source !== childWindow) return;
    const wire = event.data;
    if (wire.t === 'ready') {
      // Ack every ready — the child retries until it hears one.
      childWindow?.postMessage({ __ue: 1, cid, t: 'ready-ack' } satisfies WindowWire, targetOrigin);
      if (!isReady) {
        isReady = true;
        clearTimeout(readyTimer);
        for (const queued of outQueue.splice(0)) childWindow?.postMessage(queued, targetOrigin);
        resolveReady();
      }
    } else if (wire.t === 'msg') {
      const set = handlers.get(wire.type);
      if (set) for (const fn of set) fn(wire.payload);
    } else if (wire.t === 'result') {
      if (!resultSettled) {
        resultSettled = true;
        resolveResult(wire.payload as R);
      }
    } else if (wire.t === 'close') {
      settleClosed();
    }
  };
  localWindow.addEventListener('message', onMessage);

  function settleClosed() {
    if (closedSettled) return;
    closedSettled = true;
    clearInterval(closePoller);
    clearTimeout(readyTimer);
    localWindow.removeEventListener('message', onMessage);
    if (!resultSettled) {
      resultSettled = true;
      rejectResult(new WindowClosedError());
    }
    if (!isReady) rejectReady(new WindowClosedError());
    resolveClosed();
  }

  const childWindow = openFn(resolved.toString(), '_blank', options.features);
  if (!childWindow) {
    const err = new Error('popup blocked: window.open returned null');
    localWindow.removeEventListener('message', onMessage);
    rejectReady(err);
    resultSettled = true;
    rejectResult(err);
    return {
      window: null,
      ready,
      post: () => {},
      on: () => () => {},
      result,
      closed,
      close: () => {},
    };
  }

  const closePoller = setInterval(() => {
    if (childWindow.closed) settleClosed();
  }, 400);

  const readyTimer = setTimeout(() => {
    if (isReady || closedSettled) return;
    const err = new HandshakeTimeoutError();
    rejectReady(err);
    if (!resultSettled) {
      resultSettled = true;
      rejectResult(err);
    }
  }, options.readyTimeoutMs ?? 15_000);

  return {
    window: childWindow,
    ready,
    result,
    closed,
    post(type, payload) {
      const wire: WindowWire = { __ue: 1, cid, t: 'msg', type, payload, msgId: newMsgId() };
      if (isReady) childWindow.postMessage(wire, targetOrigin);
      else outQueue.push(wire);
    },
    on(type, handler) {
      let set = handlers.get(type);
      if (!set) {
        set = new Set();
        handlers.set(type, set);
      }
      set.add(handler as (payload: unknown) => void);
      return () => set.delete(handler as (payload: unknown) => void);
    },
    close() {
      childWindow.close?.();
    },
  };
}

/**
 * Call from the opened (child) window to connect back to its opener.
 * Throws synchronously when there is no opener or no ue-cid parameter —
 * i.e. the page was not opened via openWindow().
 */
export function connectToOpener<In extends MessageMap, Out extends MessageMap, R = unknown>(
  options: ConnectToOpenerOptions,
): OpenerConnection<In, Out, R> {
  const { peerOrigin, allowAnyOrigin } = options;
  validatePeerOrigin(peerOrigin, allowAnyOrigin);

  const opener =
    options.opener !== undefined ? options.opener : ((window.opener ?? null) as WindowLike | null);
  if (!opener) {
    throw new Error('no window.opener — this page was not opened via openWindow()');
  }
  const cid =
    options.cid ??
    (typeof location !== 'undefined' ? new URLSearchParams(location.search).get(CID_PARAM) : null);
  if (!cid) {
    throw new Error(`missing ${CID_PARAM} parameter — this page was not opened via openWindow()`);
  }

  const localWindow = options.localWindow ?? (window as unknown as WindowEventTarget);
  const targetOrigin = allowAnyOrigin ? '*' : peerOrigin;

  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  const outQueue: WindowWire[] = [];
  let isReady = false;

  let resolveReady!: () => void;
  let rejectReady!: (err: unknown) => void;
  const ready = new Promise<void>((res, rej) => ((resolveReady = res), (rejectReady = rej)));
  markHandled(ready);

  const onMessage = (event: MessageEventLike) => {
    if (!allowAnyOrigin && event.origin !== peerOrigin) return;
    if (!isWindowWire(event.data, cid)) return;
    const wire = event.data;
    if (wire.t === 'ready-ack') {
      if (!isReady) {
        isReady = true;
        clearInterval(retryTimer);
        clearTimeout(giveUpTimer);
        for (const queued of outQueue.splice(0)) opener.postMessage(queued, targetOrigin);
        resolveReady();
      }
    } else if (wire.t === 'msg') {
      const set = handlers.get(wire.type);
      if (set) for (const fn of set) fn(wire.payload);
    }
  };
  localWindow.addEventListener('message', onMessage);

  // Announce readiness until the opener acks (it may attach late in dev, we may load fast).
  const sayReady = () =>
    opener.postMessage({ __ue: 1, cid, t: 'ready' } satisfies WindowWire, targetOrigin);
  sayReady();
  const retryTimer = setInterval(sayReady, 250);
  const giveUpTimer = setTimeout(() => {
    clearInterval(retryTimer);
    localWindow.removeEventListener('message', onMessage);
    rejectReady(new HandshakeTimeoutError());
  }, options.readyTimeoutMs ?? 15_000);

  const sendOrQueue = (wire: WindowWire) => {
    if (isReady) opener.postMessage(wire, targetOrigin);
    else outQueue.push(wire);
  };

  const sayClose = () =>
    opener.postMessage({ __ue: 1, cid, t: 'close' } satisfies WindowWire, targetOrigin);
  localWindow.addEventListener('pagehide', sayClose);

  return {
    ready,
    post(type, payload) {
      sendOrQueue({ __ue: 1, cid, t: 'msg', type, payload, msgId: newMsgId() });
    },
    on(type, handler) {
      let set = handlers.get(type);
      if (!set) {
        set = new Set();
        handlers.set(type, set);
      }
      set.add(handler as (payload: unknown) => void);
      return () => set.delete(handler as (payload: unknown) => void);
    },
    finish(value) {
      sendOrQueue({ __ue: 1, cid, t: 'result', payload: value });
    },
    close() {
      sayClose();
      localWindow.removeEventListener('message', onMessage);
      localWindow.removeEventListener('pagehide', sayClose);
      if (typeof window !== 'undefined' && options.localWindow === undefined) window.close();
    },
  };
}
