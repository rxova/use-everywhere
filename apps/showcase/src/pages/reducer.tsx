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
          Press <strong>+1 × 10</strong> in two tabs at the same time. The total lands short of 20 —
          and nothing went wrong. Walk one collision through:
        </p>
        <ol className="hint" style={{ paddingLeft: 18 }}>
          <li>Both tabs are showing 4.</li>
          <li>
            Both press +1. Each one computes <code>4 + 1</code> <em>with the value it has</em>, and
            each sends the <strong>result</strong>: the number 5.
          </li>
          <li>
            Two writes of 5 arrive. Last-writer-wins picks one of them. The answer is 5, in every
            tab, forever after.
          </li>
        </ol>
        <p className="hint">
          Two presses, one increment. The state converged perfectly — every tab agrees on 5 — but
          one of the two intentions is simply gone, because{' '}
          <strong>what crossed the wire was the total, not the act of adding</strong>. Totals
          overwrite each other. That is what a register is for, and it is the right answer for
          "which theme is selected"; it is the wrong one for "how many".
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
          Same race, reaches 20 every time. The difference is what travels: each press sends the{' '}
          <strong>action</strong> — <code>{'{ type: "add", by: 1 }'}</code> — and never a total. Two
          actions arriving from two tabs are two different things to do, so both are kept and both
          are applied: 4 → 5 → 6.
        </p>
        <p className="hint">
          Something has to decide the order, and that is the leader's job: it puts every action in
          one sequence and every tab replays that same sequence, which is why they all end up at the
          same number even though nobody sent one. Your own dispatch applies locally first, so the
          UI never waits for a round trip; if the committed order turns out different from your
          optimistic guess, the tab quietly reconciles.
        </p>
        <p className="hint">
          The short version: a register is a whiteboard — you rub out the number and write a new
          one, and the last hand to touch it wins. A reducer is a ledger — you write "+1" and the
          total is whatever the entries add up to. Neither is better; they answer different
          questions.
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
