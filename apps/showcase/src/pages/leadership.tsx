import { useRef, useState } from 'react';
import { DEFAULT_NAME, getLeader, useClientId, useLeader, useLeaderEffect } from 'use-everywhere';
import { Card, Page } from '../shell/Page.js';
import { Code } from '../shell/Code.js';
import { colorOf } from '../shell/Shell.js';

export function LeadershipPage() {
  const self = useClientId();
  const { isLeader, leaderId } = useLeader();
  const [ticks, setTicks] = useState(0);
  const [waited, setWaited] = useState<string | null>(null);
  const startedAt = useRef(0);

  // The canonical use: exactly one tab does the work. Here it is a timer; in an
  // app it is the WebSocket, the poll, the token refresh.
  useLeaderEffect(() => {
    const timer = setInterval(() => setTicks((n) => n + 1), 1000);
    return () => clearInterval(timer);
  });

  const waitForIt = () => {
    startedAt.current = performance.now();
    setWaited('waiting…');
    void getLeader(DEFAULT_NAME)
      .waitForLeadership()
      .then(() =>
        setWaited(`took the seat after ${Math.round(performance.now() - startedAt.current)}ms`),
      )
      .catch(() => setWaited('gave up — this tab closed first'));
  };

  return (
    <Page
      kicker="useLeader · useLeaderEffect"
      title="Leadership"
      lede={
        <>
          One tab does the work; the others stand by. The hard part is not electing a leader — it is
          what happens the instant that tab goes away, which is the part everyone hand-rolls wrong.
        </>
      }
    >
      <Card
        title="useLeader()"
        aside={isLeader ? 'this tab holds the seat' : leaderId ? 'following' : 'no leader yet'}
      >
        <div className="row">
          <span className={`tag ${isLeader ? 'tag--on' : ''}`}>
            {isLeader ? '♔ leader' : leaderId ? 'follower' : 'vacant'}
          </span>
          {leaderId ? (
            <>
              <span className="peer" style={{ background: colorOf(leaderId) }} />
              <code>{leaderId === self ? 'this tab' : leaderId.slice(0, 8)}</code>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => getLeader(DEFAULT_NAME).resign()}
            disabled={!isLeader}
          >
            resign
          </button>
        </div>
        <p className="hint">
          Open this page in a few tabs: exactly one shows the crown. Press <strong>resign</strong>{' '}
          and another takes it immediately — handed over, not waited out. Closing the leading tab
          does the same, because a tab that closes cleanly resigns on its way out. With no other
          candidate on this page, resigning gives the seat straight back to this tab, which is the
          correct answer to "who leads" when there is only one of you.
        </p>
      </Card>

      <Card title="useLeaderEffect — work that must happen once" aside={`${ticks} ticks here`}>
        <div className="row">
          <div className="big">{ticks}</div>
          <span className="hint" style={{ margin: 0 }}>
            a one-second timer that only the leader runs
          </span>
        </div>
        <p className="hint">
          Every tab mounts this effect; only one is running it. When the seat moves, the effect
          tears down there and starts here — which is what you want for a socket, a poll, or a token
          refresh, and what five tabs each opening their own connection is not.
        </p>
      </Card>

      <Card title="waitForLeadership()" aside="a promise, for imperative code">
        <div className="row">
          <button type="button" onClick={waitForIt}>
            wait for the seat
          </button>
          <code>{waited ?? '—'}</code>
        </div>
        <p className="hint">
          Press this in a follower tab, then close the leader. The promise resolves the moment this
          tab inherits the seat. It rejects rather than hanging if this tab is torn down first, so
          an <code>await</code> in a closing tab does not leak.
        </p>
      </Card>

      <Code>{`const { isLeader } = useLeader();

useLeaderEffect(() => {
  const socket = connect();
  return () => socket.close();   // torn down the moment the seat moves
});

await getLeader(DEFAULT_NAME).waitForLeadership();`}</Code>

      <div className="note">
        <strong>Web Locks where the browser has them.</strong> On a secure origin the seat is a real
        lock: crash-safe, split-brain-free, no heartbeat traffic, and immune to a background tab's
        throttled timers — the browser itself releases it when a tab dies. On plain http there is no
        Web Locks API, so a lease-and-claim heartbeat runs instead. Same hook either way.
      </div>

      <div className="note">
        <strong>Advisory, not a distributed lock.</strong> Good for "don't open five sockets". Not
        for guarding money — that belongs on a server that can say no.
      </div>
    </Page>
  );
}
