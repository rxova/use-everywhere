import type { MessageMap, OpenedWindow, WindowClosedError } from '@use-everywhere/core';

export type OpenedWindowStatus =
  'idle' | 'opening' | 'connected' | 'done' | 'closed-early' | 'error';

/**
 * The flow's state as a discriminated union, so `status` narrows `result` and
 * `error` for you. Three independent fields could not: `result` was `R |
 * undefined` even in the 'done' branch, which is why reading it needed a
 * non-null assertion at every call site.
 */
export type OpenedWindowState<R> =
  | { status: 'idle'; result: undefined; error: undefined }
  | { status: 'opening'; result: undefined; error: undefined }
  | { status: 'connected'; result: undefined; error: undefined }
  | { status: 'done'; result: R; error: undefined }
  /** The child window went away before calling finish(). */
  | { status: 'closed-early'; result: undefined; error: WindowClosedError }
  /** The handshake timed out, the popup was blocked, or the factory threw. */
  | { status: 'error'; result: undefined; error: unknown };

export interface OpenedWindowControls<Out extends MessageMap, In extends MessageMap, R> {
  /** Call from a click handler (popup blockers require a user gesture). */
  open: () => void;
  /** Post to the child; no-op while nothing is open. */
  post: OpenedWindow<Out, In, R>['post'];
  close: () => void;
}

export type UseWindowResult<
  Out extends MessageMap,
  In extends MessageMap,
  R,
> = OpenedWindowState<R> & OpenedWindowControls<Out, In, R>;
