import type { MessageMap } from './common.types.js';

/** Wire envelope between opener and child. `cid` is the opener-generated nonce. */
export type WindowWire =
  | { __ue: 1; cid: string; t: 'ready' }
  | { __ue: 1; cid: string; t: 'ready-ack' }
  | { __ue: 1; cid: string; t: 'msg'; type: string; payload: unknown; msgId: string }
  | { __ue: 1; cid: string; t: 'result'; payload: unknown }
  | { __ue: 1; cid: string; t: 'close' };

export interface MessageEventLike {
  data: unknown;
  origin: string;
  source: unknown;
}

/** The subset of Window we post to (the other side). */
export interface WindowLike {
  postMessage(data: unknown, targetOrigin: string): void;
  closed?: boolean;
  close?(): void;
}

/** The subset of Window we listen on (our side). */
export interface WindowEventTarget {
  addEventListener(type: string, listener: (event: MessageEventLike) => void): void;
  removeEventListener(type: string, listener: (event: MessageEventLike) => void): void;
}

export interface OpenWindowOptions {
  /** Exact origin of the page being opened, e.g. 'https://pay.example.com'. Required. */
  peerOrigin: string;
  /** window.open feature string, e.g. 'popup,width=480,height=640'. */
  features?: string;
  /** Give up on the ready handshake after this long. Default 15000ms. */
  readyTimeoutMs?: number;
  /** Dev only: accept messages from any origin and post with targetOrigin '*'. */
  allowAnyOrigin?: boolean;
  /** Test seam. Defaults to window.open. */
  openFn?: (url: string, target: string, features?: string) => WindowLike | null;
  /** Test seam. Defaults to the global window. */
  localWindow?: WindowEventTarget;
}

export interface OpenedWindow<Out extends MessageMap, In extends MessageMap, R> {
  /** The opened window, or null if the popup was blocked. */
  readonly window: WindowLike | null;
  /** Resolves once the child completes the ready handshake. */
  readonly ready: Promise<void>;
  /** Queued until the handshake completes — nothing is dropped while the child loads. */
  post<K extends keyof Out & string>(type: K, payload: Out[K]): void;
  on<K extends keyof In & string>(type: K, handler: (payload: In[K]) => void): () => void;
  /** The child's finish() value. Rejects WindowClosedError / HandshakeTimeoutError. */
  readonly result: Promise<R>;
  /** Resolves when the child window is gone (with or without a result). */
  readonly closed: Promise<void>;
  /** Close the child window. */
  close(): void;
}

export interface ConnectToOpenerOptions {
  /** Exact origin of the page that opened this window. Required. */
  peerOrigin: string;
  /** Give up on the ready handshake after this long. Default 15000ms. */
  readyTimeoutMs?: number;
  /** Dev only: accept messages from any origin and post with targetOrigin '*'. */
  allowAnyOrigin?: boolean;
  /** Test seam. Defaults to window.opener. */
  opener?: WindowLike | null;
  /** Test seam. Defaults to the global window. */
  localWindow?: WindowEventTarget;
  /** Test seam. Defaults to the ue-cid query parameter. */
  cid?: string;
}

export interface OpenerConnection<In extends MessageMap, Out extends MessageMap, R> {
  /** Resolves once the opener acknowledges the ready handshake. */
  readonly ready: Promise<void>;
  /** Queued until the handshake completes. */
  post<K extends keyof Out & string>(type: K, payload: Out[K]): void;
  on<K extends keyof In & string>(type: K, handler: (payload: In[K]) => void): () => void;
  /** Deliver the terminal result to the opener. Does not close the window. */
  finish(result: R): void;
  /** Tell the opener we're going away, then close this window. */
  close(): void;
}
