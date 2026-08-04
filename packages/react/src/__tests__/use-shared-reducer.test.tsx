import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSharedReducer } from '../use-shared-reducer.js';
import { useSharedState } from '../use-shared-state.js';

const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

let n = 0;
const uniqueName = () => `red-${++n}`;

type Action = { by: number };
const add = (state: number, action: Action) => state + action.by;

describe('useSharedReducer', () => {
  it('accumulates repeated dispatches, where shared state would not', async () => {
    const name = uniqueName();
    function App() {
      const [count, dispatch] = useSharedReducer(add, 0, { name });
      const [lww, setLww] = useSharedState('n', 0, { store: name });
      return (
        <>
          <button
            onClick={() => {
              // Two of each, back to back, from the same stale render value —
              // the shape of the race, without needing a second tab.
              dispatch({ by: 1 });
              dispatch({ by: 1 });
              setLww(lww + 1);
              setLww(lww + 1);
            }}
          >
            go
          </button>
          <span data-testid="reducer">{count}</span>
          <span data-testid="lww">{lww}</span>
        </>
      );
    }
    render(<App />);
    await flush();

    act(() => screen.getByText('go').click());
    await flush();

    // The reducer sent two actions; last-writer-wins sent the same result twice.
    expect(screen.getByTestId('reducer').textContent).toBe('2');
    expect(screen.getByTestId('lww').textContent).toBe('1');
  });

  it('shares one reducer between components on the same name', async () => {
    const name = uniqueName();
    function Button() {
      const [, dispatch] = useSharedReducer(add, 0, { name });
      return <button onClick={() => dispatch({ by: 5 })}>go</button>;
    }
    function Display() {
      const [count] = useSharedReducer(add, 0, { name });
      return <span data-testid="count">{count}</span>;
    }
    render(
      <>
        <Button />
        <Display />
      </>,
    );
    await flush();

    act(() => screen.getByText('go').click());
    await flush();

    expect(screen.getByTestId('count').textContent).toBe('5');
  });

  it('keeps reducers on one bus apart by key', async () => {
    const name = uniqueName();
    function App() {
      const [votes, voteFor] = useSharedReducer(add, 0, { name, key: 'votes' });
      const [clicks] = useSharedReducer(add, 0, { name, key: 'clicks' });
      return (
        <>
          <button onClick={() => voteFor({ by: 1 })}>go</button>
          <span data-testid="votes">{votes}</span>
          <span data-testid="clicks">{clicks}</span>
        </>
      );
    }
    render(<App />);
    await flush();

    act(() => screen.getByText('go').click());
    await flush();

    expect(screen.getByTestId('votes').textContent).toBe('1');
    expect(screen.getByTestId('clicks').textContent).toBe('0');
  });

  it('falls back to the default bus when called bare', async () => {
    function App() {
      const [count, dispatch] = useSharedReducer(add, 0);
      return <button onClick={() => dispatch({ by: 2 })}>{count}</button>;
    }
    render(<App />);
    await flush();

    act(() => screen.getByText('0').click());
    await flush();

    expect(screen.getByText('2')).toBeTruthy();
  });

  it('keeps a stable dispatch identity across renders', async () => {
    const name = uniqueName();
    const seen = new Set<unknown>();
    function App() {
      const [count, dispatch] = useSharedReducer(add, 0, { name });
      seen.add(dispatch);
      return <button onClick={() => dispatch({ by: 1 })}>{count}</button>;
    }
    render(<App />);
    await flush();
    act(() => screen.getByText('0').click());
    await flush();

    // Re-rendered with a new value, and dispatch is still the same function —
    // so it is safe in a dependency array.
    expect(screen.getByText('1')).toBeTruthy();
    expect(seen.size).toBe(1);
  });
});
