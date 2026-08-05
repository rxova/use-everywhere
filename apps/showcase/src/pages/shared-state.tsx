import { useSharedState } from 'use-everywhere';
import { Card, Page } from '../shell/Page.js';
import { useTheme } from '../shell/theme.js';
import { Code } from '../shell/Code.js';

export function SharedStatePage() {
  const [count, setCount] = useSharedState('count', 0);
  const [note, setNote] = useSharedState('note', '');
  const [theme, setTheme] = useTheme();

  return (
    <Page
      kicker="useSharedState"
      title="Shared state"
      lede={
        <>
          One hook. It behaves like <code>useState</code> until a second tab appears, and then it
          keeps them the same — no provider, no server, no store to wire up.
        </>
      }
    >
      <Card title="useSharedState('count', 0)" aside="every tab, instantly">
        <div className="row">
          <button type="button" onClick={() => setCount((n) => n - 1)} aria-label="decrement">
            −
          </button>
          <div className="big">{count}</div>
          <button type="button" onClick={() => setCount((n) => n + 1)} aria-label="increment">
            +
          </button>
          <button type="button" className="ghost" onClick={() => setCount(0)}>
            reset
          </button>
        </div>
        <p className="hint">
          The updater form works the way it does in React: <code>setCount(n =&gt; n + 1)</code>{' '}
          reads the value this tab has right now. It is still last-writer-wins, so two tabs
          incrementing at the same millisecond can land on the same number — that is what{' '}
          <a href="#/reducer">counters that add up</a> is about.
        </p>
      </Card>

      <Card title="useSharedState('note', '')" aside="a string, on every keystroke">
        <div className="row">
          <input
            type="text"
            value={note}
            placeholder="Type here — the other tab is already showing it"
            onChange={(event) => setNote(event.target.value)}
            style={{ flex: 1 }}
          />
        </div>
      </Card>

      <Card title="A key can hold anything cloneable" aside="the toggle up there writes this key">
        <div className="row">
          {(['system', 'light', 'dark'] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={theme === option ? 'primary' : ''}
              onClick={() => setTheme(option)}
            >
              {option}
            </button>
          ))}
        </div>
        <p className="hint">
          These are the same three buttons as the toggle in the top bar, because they are the same
          key in the same store — press one and every open tab repaints. Values cross the wire by{' '}
          <strong>structured clone</strong>: objects, arrays, <code>Date</code>, <code>Map</code>,{' '}
          <code>Set</code>, typed arrays. Not functions, not class instances — a write that cannot
          be cloned throws where you made it, rather than leaving this tab holding a value no peer
          will ever see.
        </p>
      </Card>

      <Code>{`import { useSharedState } from 'use-everywhere';

function Cart() {
  const [count, setCount] = useSharedState('count', 0);

  return <button onClick={() => setCount(n => n + 1)}>{count}</button>;
}`}</Code>

      <div className="note">
        <strong>What you did not have to do:</strong> no provider, no context, no store instance to
        pass around, and nothing to clean up. The first component to name a key creates the store
        behind it; the last one to unmount releases it.
      </div>
    </Page>
  );
}
