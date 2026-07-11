import type { MessageMap, OpenedWindow } from '@use-everywhere/core';

export type OpenedWindowStatus =
  'idle' | 'opening' | 'connected' | 'done' | 'closed-early' | 'error';

export interface UseOpenedWindow<Out extends MessageMap, In extends MessageMap, R> {
  /** Call from a click handler (popup blockers require a user gesture). */
  open: () => void;
  status: OpenedWindowStatus;
  /** The child's finish() value, once status is 'done'. */
  result: R | undefined;
  error: unknown;
  /** Post to the child; no-op while nothing is open. */
  post: OpenedWindow<Out, In, R>['post'];
  close: () => void;
}
