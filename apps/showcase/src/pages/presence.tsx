import { useState } from 'react';
import { useClientId, usePeers, usePresenceMetadata } from 'use-everywhere';
import { Card, Page } from '../shell/Page.js';
import { Code } from '../shell/Code.js';
import { colorOf } from '../shell/Shell.js';

interface Meta {
  name?: string;
  page?: string;
}

const NAMES = ['Ada', 'Grace', 'Alan', 'Edsger', 'Barbara', 'Ken'];

export function PresencePage() {
  const self = useClientId();
  const [name, setName] = useState(() => NAMES[Math.floor(Math.random() * NAMES.length)]!);

  // Published in an effect, on every change. A no-op when the value has not
  // actually changed, so calling it every render costs nothing.
  usePresenceMetadata({ name, page: 'presence' } satisfies Meta, { includeSelf: true });

  const peers = usePeers({ includeSelf: true });

  return (
    <Page
      kicker="usePeers · usePresenceMetadata"
      title="Presence"
      lede={
        <>
          Who else is here, right now — with whatever each of them wants to say about itself. No
          server, no websocket, no polling: the bus already heartbeats, and presence rides it.
        </>
      }
    >
      <Card title="usePeers({ includeSelf: true })" aside={`${peers.length} here`}>
        <div className="row">
          <span className="tag">you are</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            style={{ width: 160 }}
          />
          <span className="hint" style={{ margin: 0 }}>
            — type, and watch the other tabs relabel you
          </span>
        </div>

        <table style={{ marginTop: 14 }}>
          <thead>
            <tr>
              <th>client</th>
              <th>kind</th>
              <th>metadata</th>
            </tr>
          </thead>
          <tbody>
            {peers.map((peer) => {
              const meta = peer.metadata as Meta | undefined;
              return (
                <tr key={peer.id}>
                  <td>
                    <span className="peer" style={{ background: colorOf(peer.id) }} />{' '}
                    {peer.id === self ? 'this tab' : peer.id.slice(0, 8)}
                  </td>
                  <td>{peer.kind}</td>
                  <td>{meta?.name ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card title="Liveness is presence's job, not yours">
        <p className="hint" style={{ marginTop: 0 }}>
          There is no "last seen" column here on purpose. A roster that made you render timestamps
          would be handing you its bookkeeping: peers ping on a heartbeat, a peer that goes quiet is{' '}
          <strong>probed once</strong> in case it was merely a throttled background tab, and only
          then dropped. The list you get is already the answer — who is here — rather than the
          evidence you would have to interpret.
        </p>
        <p className="hint">
          The roster only changes when it <em>changes</em>: a ping from a peer that is already in it
          notifies nobody, which is what keeps a page with five tabs open from re-rendering twice a
          second for no reason.
        </p>
      </Card>

      <Card title="Leaving loudly, and leaving quietly">
        <p className="hint" style={{ marginTop: 0 }}>
          Close one of your other tabs. Its row disappears <strong>immediately</strong> — a closing
          tab says goodbye on <code>pagehide</code>, and every peer drops it on the spot.
        </p>
        <p className="hint">
          A tab that <em>crashes</em> says nothing. That row lingers a few seconds: presence notices
          the silence, probes the peer once in case it was merely throttled, and only then drops it.
          Both are correct, and only one can be instant — which is the whole reason the roster is
          "who answered recently" rather than "who once said hello".
        </p>
      </Card>

      <Code>{`// The roster, with this tab included.
const peers = usePeers({ includeSelf: true });

// What this tab tells the others about itself.
usePresenceMetadata({ name: user.name, editing: docId });

peers.map(p => p.metadata.name); // ['Ada', 'Grace']`}</Code>

      <div className="note">
        <strong>Workers count.</strong> A `SharedWorker` or a dedicated worker running the library
        shows up here as a peer with <code>kind: 'worker'</code> — square dots in the bar at the
        top. That is how you answer "is the worker still alive" without inventing a protocol for it.
      </div>
    </Page>
  );
}
