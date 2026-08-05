import { useSharedReducer, useSharedState } from 'use-everywhere';
import { Card, Page } from '../shell/Page.js';
import { Code } from '../shell/Code.js';

type Action = { type: 'add'; by: number };

const total = (state: { total: number }, action: Action) => ({
  total: state.total + action.by,
});

export function ReducerPage() {
  const [lossy, setLossy] = useSharedState('lossy-counter', 0);
  const [ordered, dispatch] = useSharedReducer<{ total: number }, Action>(
    total,
    { total: 0 },
    { name: 'showcase-votes' },
  );

  const hammer = (fn: () => void) => {
    // Ten writes as fast as the tab can make them: enough to lose some,
    // if losing is possible.
    for (let index = 0; index < 10; index += 1) setTimeout(fn, index * 12);
  };

  return (
    <Page
      kicker="useSharedReducer"
      title="Counters that add up"
      lede={
        <>
          Last-writer-wins is right for "which theme". It is wrong for "how many", and the
          difference only shows up when two tabs press the button at once. Both counters are below.
          Race them.
        </>
      }
    >
      <Card title="useSharedState — a register" aside="drops concurrent increments">
        <div className="row">
          <div className="big">{lossy}</div>
          <button type="button" onClick={() => setLossy((n) => n + 1)}>
            +1
          </button>
          <button type="button" onClick={() => hammer(() => setLossy((n) => n + 1))}>
            +1 × 10
          </button>
          <button type="button" className="ghost" onClick={() => setLossy(0)}>
            reset
          </button>
        </div>
        <p className="hint">
          Press <strong>+1 × 10</strong> in two tabs at the same time. The total lands short of 20,
          and it is not a bug: both tabs read 4, both wrote 5, and 5 is the correct last-writer-wins
          answer. The value converged; the <em>intent</em> did not survive.
        </p>
      </Card>

      <Card title="useSharedReducer — an operation log" aside="loses nothing">
        <div className="row">
          <div className="big">{ordered.total}</div>
          <button type="button" onClick={() => dispatch({ type: 'add', by: 1 })}>
            +1
          </button>
          <button type="button" onClick={() => hammer(() => dispatch({ type: 'add', by: 1 }))}>
            +1 × 10
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => dispatch({ type: 'add', by: -ordered.total })}
          >
            reset
          </button>
        </div>
        <p className="hint">
          The same race, and this one reaches 20 every time. Each press is an{' '}
          <strong>action</strong> rather than a value: the leader puts every action in one order,
          and every tab replays that order. Your own dispatch applies locally first, so the UI never
          waits for a round trip — if the committed order turns out different, the tab reconciles.
        </p>
      </Card>

      <Code>{`const [state, dispatch] = useSharedReducer(
  (state, action) => ({ total: state.total + action.by }),
  { total: 0 },
);

dispatch({ type: 'add', by: 1 }); // never lost, however many tabs press it`}</Code>

      <div className="note">
        <strong>The ceiling, stated on purpose:</strong> this is an ordered operation log, not a
        CRDT. It makes commutative operations safe — counters, tallies, sets of ids. It will not
        merge two people typing in the same paragraph, and it is not trying to.
      </div>
    </Page>
  );
}
