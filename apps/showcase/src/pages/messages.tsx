import { useState } from 'react';
import {
  useAnswer,
  useAsk,
  useChannel,
  useClientId,
  useIsLeader,
  useMessage,
  useSend,
} from 'use-everywhere';
import { Card, Page } from '../shell/Page.js';
import { Code } from '../shell/Code.js';
import { colorOf } from '../shell/Shell.js';

/**
 * The message map is the contract: types and payloads, checked at compile time.
 *
 * A `type` rather than an `interface`, and that is not cosmetic — TypeScript
 * gives object type aliases an implicit index signature and interfaces none, so
 * an interface is not assignable to `MessageMap` and the hooks reject it.
 */
type Messages = {
  toast: { text: string };
  'sign-out': { reason: string };
  'who-has-focus': null;
};

/** Replies, keyed by the message they answer. Same rule. */
type Replies = {
  'who-has-focus': { clientId: string; focused: boolean };
};

export function MessagesPage() {
  const self = useClientId();
  const isLeader = useIsLeader();
  const channel = useChannel<Messages, Replies>('showcase-events');
  const post = useSend(channel);
  const ask = useAsk(channel);

  const [received, setReceived] = useState<{ seq: number; text: string; who: string }[]>([]);
  const [signedOut, setSignedOut] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string>('');
  const [draft, setDraft] = useState('Table 4 is ready');

  useMessage(channel, 'toast', (payload, meta) => {
    setReceived((prev) =>
      [
        { seq: prev.length, text: payload.text, who: meta.self ? 'you' : meta.clientId },
        ...prev,
      ].slice(0, 8),
    );
  });

  useMessage(channel, 'sign-out', (payload) => setSignedOut(payload.reason));

  // Only the leader answers. Without that gate the first reply to arrive wins,
  // which is fine for "any tab will do" and wrong for "the tab that owns this".
  useAnswer(channel, 'who-has-focus', () => ({ clientId: self, focused: document.hasFocus() }), {
    enabled: isLeader,
  });

  const askLeader = async () => {
    setAnswer('…');
    try {
      const reply = await ask('who-has-focus', null, { timeoutMs: 1500 });
      setAnswer(
        `${reply.clientId === self ? 'this tab' : reply.clientId.slice(0, 6)} · ${
          reply.focused ? 'focused' : 'in the background'
        }`,
      );
    } catch {
      setAnswer('nobody answered in time');
    }
  };

  return (
    <Page
      kicker="useChannel · useMessage · useAsk"
      title="Messages & ask"
      lede={
        <>
          State is for facts that persist. Messages are for things that <em>happen</em> — a toast, a
          sign-out, an invalidation. Typed both ways, and with a reply when you need one.
        </>
      }
    >
      <Card title="post — fire and forget" aside="every other tab hears it">
        <div className="row">
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            style={{ flex: 1 }}
          />
          <button type="button" className="primary" onClick={() => post('toast', { text: draft })}>
            broadcast
          </button>
          <button
            type="button"
            onClick={() => post('toast', { text: draft }, { echo: true })}
            title="Deliver to this tab as well"
          >
            broadcast + echo
          </button>
        </div>
        {received.length === 0 ? (
          <p className="empty" style={{ marginTop: 12 }}>
            nothing received yet
          </p>
        ) : (
          <ul className="log" style={{ marginTop: 12 }}>
            {received.map((item) => (
              <li key={item.seq}>
                <span
                  className="peer"
                  style={{ background: item.who === 'you' ? '#8b9bb0' : colorOf(item.who) }}
                />
                <span>{item.text}</span>
                <span className="who">{item.who === 'you' ? 'you' : item.who.slice(0, 6)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="hint">
          A post does <strong>not</strong> come back to the sender by default — same as a raw
          `BroadcastChannel`, and the reason your own optimistic update does not run twice. Pass{' '}
          <code>{'{ echo: true }'}</code> when one handler should serve every tab including this
          one.
        </p>
      </Card>

      <Card title="The sign-out everybody forgets" aside="one message, every tab">
        <div className="row">
          <button
            type="button"
            className="danger"
            onClick={() =>
              post('sign-out', { reason: 'signed out in another tab' }, { echo: true })
            }
          >
            sign out everywhere
          </button>
          {signedOut ? <span className="tag tag--bad">{signedOut}</span> : null}
          {signedOut ? (
            <button type="button" className="ghost" onClick={() => setSignedOut(null)}>
              undo
            </button>
          ) : null}
        </div>
        <p className="hint">
          The bug this fixes is in almost every app: a user signs out in one tab and the other four
          keep showing their inbox until something happens to 401. Five lines here, and every tab
          finds out in the same millisecond.
        </p>
      </Card>

      <Card
        title="ask — a question with an answer"
        aside={isLeader ? 'this tab answers' : 'the leader answers'}
      >
        <div className="row">
          <button type="button" onClick={() => void askLeader()}>
            ask who has focus
          </button>
          <code>{answer || '—'}</code>
        </div>
        <p className="hint">
          <code>ask</code> returns a promise. The responder here is gated on leadership, so the
          reply comes from one specific tab rather than whichever answered first — and if that tab
          has just died, the ask rejects on its timeout instead of hanging.
        </p>
      </Card>

      <Code>{`type Messages = { toast: { text: string } };
type Replies = { 'who-has-focus': { clientId: string } };

const channel = useChannel<Messages, Replies>('events');

useMessage(channel, 'toast', ({ text }) => show(text));
useSend(channel)('toast', { text: 'Saved' });

useAnswer(channel, 'who-has-focus', () => ({ clientId }), { enabled: isLeader });
const reply = await useAsk(channel)('who-has-focus', null, { timeoutMs: 1500 });`}</Code>

      <div className="note">
        <strong>Typed, and optionally validated.</strong> The message map is compile-time. For
        payloads crossing a version boundary — a tab on last week's deploy — attach a{' '}
        <code>schema</code> (Zod, Valibot, anything Standard Schema) and a message that no longer
        matches is dropped loudly instead of cast by faith.
      </div>
    </Page>
  );
}
