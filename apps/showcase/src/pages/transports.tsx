import { useEffect, useState } from 'react';
import {
  getTransportKind,
  getWireSkew,
  isBroadcastChannelAvailable,
  isStorageEventAvailable,
  WIRE_VERSION,
} from 'use-everywhere';
import { Card, Page } from '../shell/Page.js';
import { Code } from '../shell/Code.js';

export function TransportsPage() {
  const [kind, setKind] = useState<string | null>(null);
  const [skew, setSkew] = useState<readonly number[]>([]);

  useEffect(() => {
    const read = () => {
      setKind(getTransportKind('use-everywhere'));
      setSkew(getWireSkew('use-everywhere'));
    };
    read();
    const timer = setInterval(read, 700);
    return () => clearInterval(timer);
  }, []);

  const rows: [string, string, boolean | null][] = [
    [
      'BroadcastChannel',
      'the real thing: structured clone, no polling',
      isBroadcastChannelAvailable(),
    ],
    ['storage event', 'fallback: JSON only, same-origin, still works', isStorageEventAvailable()],
    ['none', 'nothing is shared — and it says so', null],
  ];

  return (
    <Page
      kicker="Transports"
      title="Transports & degradation"
      lede={
        <>
          The library picks the best mechanism this browser actually has, and tells you which one it
          got. A degraded transport is a supported state; a <em>silent</em> degraded transport is
          the worst failure this library could have, because it looks exactly like success.
        </>
      }
    >
      <Card title="What this tab is running on" aside={kind ?? 'no bus yet'}>
        <div className="row">
          <span className={`tag ${kind === 'none' ? 'tag--bad' : 'tag--on'}`}>{kind ?? '—'}</span>
          <code>getTransportKind('use-everywhere')</code>
        </div>
        <table style={{ marginTop: 14 }}>
          <thead>
            <tr>
              <th>mechanism</th>
              <th>what it means</th>
              <th>available here</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, meaning, available]) => (
              <tr key={name}>
                <td>{name}</td>
                <td>{meaning}</td>
                <td>{available === null ? '—' : available ? 'yes' : 'no'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">
          Try it in Safari private browsing, or with site data blocked: storage is denied, the chain
          runs out, and <code>getTransportKind</code> returns <code>'none'</code> with a warning (
          <code>UE1010</code>). Every write is then local — which your app can detect and say,
          rather than showing a UI that pretends to be syncing.
        </p>
      </Card>

      <Card title="Wire protocol" aside={`v${WIRE_VERSION}`}>
        <div className="row">
          <span className="tag">this build speaks v{WIRE_VERSION}</span>
          {skew.length === 0 ? (
            <span className="hint" style={{ margin: 0 }}>
              no foreign versions seen on this bus
            </span>
          ) : (
            <span className="tag tag--bad">also seen: v{skew.join(', v')}</span>
          )}
        </div>
        <p className="hint">
          Mid-deploy, a tab from the old build and a tab from the new one meet. If their wire
          versions differ they <strong>partition loudly</strong>: foreign messages are dropped
          rather than misread, <code>getWireSkew()</code> reports it, and a development warning
          names both versions. Prompting the user to reload beats a page that has quietly stopped
          syncing.
        </p>
      </Card>

      <Code>{`if (getTransportKind('use-everywhere') === 'none') {
  toast('Sharing between tabs is off — storage looks blocked in this browser.');
}

if (getWireSkew('use-everywhere').length > 0) {
  toast('A new version is available. Reload to keep your tabs in sync.');
}`}</Code>

      <div className="note">
        <strong>Workers, too.</strong> A dedicated worker or a SharedWorker runs the same core and
        joins the same bus, which is how "the worker owns the socket and the tabs read its results"
        becomes four lines instead of a message protocol you have to invent and then debug.
      </div>
    </Page>
  );
}
