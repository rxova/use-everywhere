import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getSharedStore } from '../registry.js';
import { shallowEqual, useSharedSelector } from '../use-shared-selector.js';
import { useSharedState } from '../use-shared-state.js';

const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

let n = 0;
const uniqueName = () => `sel-${++n}`;

type Shape = Record<string, unknown>;

describe('useSharedSelector', () => {
  it('re-renders only when the selected value changes', async () => {
    const name = uniqueName();
    const store = getSharedStore(name);
    let renders = 0;

    function Total() {
      renders++;
      const total = useSharedSelector<Shape, number>((s) => Number(s.a ?? 0) + Number(s.b ?? 0), {
        store: name,
      });
      return <span data-testid="total">{total}</span>;
    }
    render(<Total />);
    await flush();
    const baseline = renders;

    // Touches a key the selector does not read.
    act(() => store.set('unrelated', 1));
    await flush();
    expect(renders).toBe(baseline);
    expect(screen.getByTestId('total').textContent).toBe('0');

    act(() => store.set('a', 2));
    await flush();
    expect(screen.getByTestId('total').textContent).toBe('2');
    expect(renders).toBeGreaterThan(baseline);
  });

  it('does not re-render when a write leaves the selection equal', async () => {
    const name = uniqueName();
    const store = getSharedStore(name);
    store.set('items', ['a', 'b']);
    let renders = 0;

    function Count() {
      renders++;
      const count = useSharedSelector<Shape, number>(
        (s) => (s.items as string[] | undefined)?.length ?? 0,
        {
          store: name,
        },
      );
      return <span data-testid="count">{count}</span>;
    }
    render(<Count />);
    await flush();
    const baseline = renders;

    // A different array, same length: the store changed, the selection did not.
    act(() => store.set('items', ['c', 'd']));
    await flush();

    expect(renders).toBe(baseline);
    expect(screen.getByTestId('count').textContent).toBe('2');
  });

  it('needs an equality function for a selector that builds an object', async () => {
    const name = uniqueName();
    const store = getSharedStore(name);
    store.set('first', 'Ada');
    store.set('last', 'Lovelace');
    let renders = 0;

    function Name() {
      renders++;
      const who = useSharedSelector<Shape, { first: unknown; last: unknown }>(
        (s) => ({ first: s.first, last: s.last }),
        { store: name, equal: shallowEqual },
      );
      return <span data-testid="who">{`${String(who.first)} ${String(who.last)}`}</span>;
    }
    render(<Name />);
    await flush();
    const baseline = renders;

    // A fresh object every run, so without `equal` this would re-render on any
    // write to the store — the exact trap a selector is supposed to avoid.
    act(() => store.set('unrelated', Math.random()));
    await flush();

    expect(renders).toBe(baseline);
    expect(screen.getByTestId('who').textContent).toBe('Ada Lovelace');
  });

  it('picks up a selector that changed between renders', async () => {
    const name = uniqueName();
    const store = getSharedStore(name);
    store.set('a', 1);
    store.set('b', 2);

    function Switcher() {
      const [key, setKey] = useSharedState<'a' | 'b'>('which', 'a', { store: `${name}-ctl` });
      // A different function each render, and a different answer — caching on
      // the store snapshot alone would keep returning the old key's value.
      const value = useSharedSelector<Shape, unknown>((s) => s[key], { store: name });
      return <button onClick={() => setKey('b')}>{String(value)}</button>;
    }
    render(<Switcher />);
    await flush();
    expect(screen.getByText('1')).toBeTruthy();

    act(() => screen.getByText('1').click());
    await flush();

    expect(screen.getByText('2')).toBeTruthy();
  });

  it('sees undefined for a key nothing has registered', async () => {
    const name = uniqueName();

    function Missing() {
      const value = useSharedSelector<Shape, unknown>((s) => s.neverWritten, { store: name });
      return <span data-testid="v">{value === undefined ? 'undefined' : 'something'}</span>;
    }
    render(<Missing />);
    await flush();

    // A selector reads; it does not declare. Worth pinning, because the
    // alternative reading is that it would see an initial from somewhere.
    expect(screen.getByTestId('v').textContent).toBe('undefined');
  });
});

describe('shallowEqual', () => {
  it('compares one level and no further', () => {
    expect(shallowEqual({ a: 1 }, { a: 1 })).toBe(true);
    expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(shallowEqual([1, 2], [1, 2])).toBe(true);
    expect(shallowEqual([1, 2], [2, 1])).toBe(false);
    // One level: a nested object is compared by identity, which is the whole
    // point of "shallow" and the thing that surprises people.
    expect(shallowEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(false);
  });

  it('handles primitives and null without pretending they are objects', () => {
    expect(shallowEqual(1, 1)).toBe(true);
    expect(shallowEqual(null, null)).toBe(true);
    expect(shallowEqual(null, {})).toBe(false);
    expect(shallowEqual({}, null)).toBe(false);
    expect(shallowEqual('a', 'b')).toBe(false);
  });
});
