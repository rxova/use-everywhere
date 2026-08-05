import { Inspector } from 'use-everywhere/devtools';
import { CheckoutDemo } from './demos/CheckoutDemo.js';
import { LeaderDemo } from './demos/LeaderDemo.js';
import { PersistDemo } from './demos/PersistDemo.js';
import { PresenceStrip } from './demos/PresenceStrip.js';
import { SharedStateDemo } from './demos/SharedStateDemo.js';
import { ThemeToggle } from './theme.js';

export function App() {
  return (
    <div className="wrap">
      <header className="masthead">
        <h1>
          use-everywhere<span className="paren">( )</span>
        </h1>
        <ThemeToggle />
      </header>
      <p className="tagline">
        State that exists in every tab, window, and worker — plus a secure channel to windows on
        other origins. Open this page in a second tab and watch them sync.
      </p>
      <PresenceStrip />
      <div className="grid">
        <SharedStateDemo />
        <LeaderDemo />
        <PersistDemo />
        <CheckoutDemo />
      </div>
      <footer>
        Same-origin sync runs on <code>BroadcastChannel</code>; the payment window runs on
        cross-origin <code>postMessage</code>. No server involved.
      </footer>
      {import.meta.env.DEV ? <Inspector defaultOpen /> : null}
    </div>
  );
}
