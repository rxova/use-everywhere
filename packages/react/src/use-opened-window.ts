import { useCallback, useRef, useState } from 'react';
import { WindowClosedError, type MessageMap, type OpenedWindow } from '@use-everywhere/core';
import type { OpenedWindowStatus, UseOpenedWindow } from './use-opened-window.types.js';

/**
 * Drive an openWindow() flow from a component: the factory is called on
 * open(), and the child window's lifecycle is folded into render state.
 * Reopening replaces the previous window; a stale window's outcome is ignored.
 */
export function useOpenedWindow<Out extends MessageMap, In extends MessageMap, R = unknown>(
  factory: () => OpenedWindow<Out, In, R>,
): UseOpenedWindow<Out, In, R> {
  const [status, setStatus] = useState<OpenedWindowStatus>('idle');
  const [result, setResult] = useState<R | undefined>(undefined);
  const [error, setError] = useState<unknown>(undefined);
  const current = useRef<OpenedWindow<Out, In, R> | null>(null);
  const factoryRef = useRef(factory);
  factoryRef.current = factory;

  const open = useCallback(() => {
    current.current?.close();
    let opened: OpenedWindow<Out, In, R>;
    try {
      opened = factoryRef.current();
    } catch (err) {
      setStatus('error');
      setError(err);
      return;
    }
    current.current = opened;
    setStatus('opening');
    setResult(undefined);
    setError(undefined);

    const fresh = () => current.current === opened;
    opened.ready.then(
      () => {
        if (fresh()) setStatus((s) => (s === 'opening' ? 'connected' : s));
      },
      () => {}, // surfaced through result below
    );
    opened.result.then(
      (value) => {
        if (!fresh()) return;
        setResult(value);
        setStatus('done');
      },
      (err) => {
        if (!fresh()) return;
        setError(err);
        setStatus(err instanceof WindowClosedError ? 'closed-early' : 'error');
      },
    );
  }, []);

  const post = useCallback<OpenedWindow<Out, In, R>['post']>((type, payload) => {
    current.current?.post(type, payload);
  }, []);

  const close = useCallback(() => current.current?.close(), []);

  return { open, status, result, error, post, close };
}
