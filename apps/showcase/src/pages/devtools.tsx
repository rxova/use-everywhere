import { useState } from 'react';
import { Inspector } from 'use-everywhere/devtools';
import { Card, Page } from '../shell/Page.js';
import { Code } from '../shell/Code.js';

export function DevtoolsPage() {
  const [mounted, setMounted] = useState(true);

  return (
    <Page
      kicker="use-everywhere/devtools"
      title="Devtools"
      lede={
        <>
          Debugging five tabs by adding a <code>console.log</code> to five tabs is miserable. The
          Inspector is a floating panel showing what this tab is saying and hearing — and it is live
          on this page right now, bottom right.
        </>
      }
    >
      <Card title="The Inspector" aside={mounted ? 'mounted' : 'unmounted'}>
        <div className="row">
          <button
            type="button"
            className={mounted ? '' : 'primary'}
            onClick={() => setMounted((value) => !value)}
          >
            {mounted ? 'unmount it' : 'mount it'}
          </button>
          <span className="hint" style={{ margin: 0 }}>
            look bottom-right — click the bar to expand
          </span>
        </div>

        <p className="hint">
          It shows this tab's client id and whether it leads, the peers alive right now, every store
          key with its value and <strong>version clock</strong>, and a live log of every wire in
          both directions. The version column is the useful one: when two tabs disagree, the clocks
          say which write won and who made it.
        </p>
      </Card>

      <Card title="Reading a log that will not sit still">
        <p className="hint" style={{ marginTop: 0 }}>
          <strong>pause</strong> freezes the log and only the log — the panel keeps observing, so
          there is no hole in it, and the crown keeps updating because leadership is state rather
          than history. <strong>clear</strong> empties it. <strong>filter</strong> matches on{' '}
          <code>scope/type</code> and on the sender, so <code>leader</code> shows the election and
          six characters of a client id shows one tab.
        </p>
        <p className="hint">
          Click any value in <strong>State</strong> to edit it. Type JSON, press Enter, and the
          write goes through the store — it takes a version and lands in every tab, exactly as your
          own code's write would. An edit that only changed the panel would be a lie the moment a
          peer looked.
        </p>
      </Card>

      <Card title="It does not change what it measures">
        <p className="hint" style={{ marginTop: 0 }}>
          The Inspector never creates a <code>Leader</code>. Doing so would make a passive tab a
          candidate that never asked to be one — so it reads the crown out of the wire log it is
          already watching. Mounting it cannot change who leads.
        </p>
        <p className="hint">
          It also sees <strong>outbound</strong> wires. A <code>BroadcastChannel</code> never echoes
          to the sender, so the messages your own tab sends are invisible to anything listening on
          the transport; they come from a debug seam inside the bus, and they are usually the half
          you need.
        </p>
      </Card>

      <Code>{`import { Inspector } from 'use-everywhere/devtools';

function App() {
  return (
    <>
      <YourApp />
      {import.meta.env.DEV && <Inspector defaultOpen />}
    </>
  );
}`}</Code>

      <div className="note">
        <strong>A separate entry point, on purpose.</strong> It lives on the <code>devtools</code>{' '}
        subpath, so if you do not import it, it is not in your bundle. Guard it behind your dev flag
        and it never reaches production at all.
      </div>

      <div className="note">
        <strong>Without React:</strong> <code>observeBus(name, fn)</code> is the same seam as a
        plain function — it works even for a bus that does not exist yet, so you can observe first
        and create later. <code>enableDebug()</code> wires it to the console.
      </div>

      {mounted ? <Inspector /> : null}
    </Page>
  );
}
