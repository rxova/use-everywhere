import { useCallback, useEffect, useRef, useState } from 'react';
import { WindowClosedError, type MessageMap, type OpenedWindow } from '@use-everywhere/core';
import type { OpenedWindowState, UseWindowResult } from './use-window-result.types.js';

const IDLE = Object.freeze({
  status: 'idle',
  result: undefined,
  error: undefined,
}) as OpenedWindowState<never>;

/**
 * Drive an openWindow() flow from a component: the factory is called on
 * open(), and the child window's lifecycle is folded into render state.
 * Reopening replaces the previous window; a stale window's outcome is ignored.
 *
 * The child window deliberately outlives an unmount: closing a payment page
 * because a route changed would lose the user's in-flight transaction. Call
 * close() if the component owns the window's lifetime.
 */
export function useWindowResult<Out extends MessageMap, In extends MessageMap, R = unknown>(
  factory: () => OpenedWindow<Out, In, R>,
): UseWindowResult<Out, In, R> {
  // One state object, not three: status/result/error move together, and
  // separate setters let a render observe 'done' before the result landed.
  const [state, setState] = useState<OpenedWindowState<R>>(IDLE as OpenedWindowState<R>);
  const current = useRef<OpenedWindow<Out, In, R> | null>(null);

  // Updated in an effect, never during render — a render-phase ref write is
  // not safe under concurrent rendering, where a render can be discarded.
  const factoryRef = useRef(factory);
  useEffect(() => {
    factoryRef.current = factory;
  });

  const open = useCallback(() => {
    current.current?.close();
    let opened: OpenedWindow<Out, In, R>;
    try {
      opened = factoryRef.current();
    } catch (err) {
      setState({ status: 'error', result: undefined, error: err });
      return;
    }
    current.current = opened;
    setState({ status: 'opening', result: undefined, error: undefined });

    const fresh = () => current.current === opened;
    opened.ready.then(
      () => {
        if (!fresh()) return;
        setState((s) =>
          s.status === 'opening' ? { status: 'connected', result: undefined, error: undefined } : s,
        );
      },
      () => {}, // surfaced through result below
    );
    opened.result.then(
      (value) => {
        if (fresh()) setState({ status: 'done', result: value, error: undefined });
      },
      (err) => {
        if (!fresh()) return;
        setState(
          err instanceof WindowClosedError
            ? { status: 'closed-early', result: undefined, error: err }
            : { status: 'error', result: undefined, error: err },
        );
      },
    );
  }, []);

  const post = useCallback<OpenedWindow<Out, In, R>['post']>((type, payload) => {
    current.current?.post(type, payload);
  }, []);

  const close = useCallback(() => current.current?.close(), []);

  return { ...state, open, post, close };
}
