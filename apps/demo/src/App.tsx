import { CheckoutDemo } from './demos/CheckoutDemo.js';
import { PresenceStrip } from './demos/PresenceStrip.js';
import { SharedStateDemo } from './demos/SharedStateDemo.js';

export function App() {
  return (
    <div className="wrap">
      <h1>
        use-everywhere<span className="paren">( )</span>
      </h1>
      <p className="tagline">
        State that exists in every tab, window, and worker — plus a secure channel to windows on
        other origins. Open this page in a second tab and watch them sync.
      </p>
      <PresenceStrip />
      <div className="grid">
        <SharedStateDemo />
        <CheckoutDemo />
      </div>
      <footer>
        Same-origin sync runs on <code>BroadcastChannel</code>; the payment window runs on
        cross-origin <code>postMessage</code>. No server involved.
      </footer>
    </div>
  );
}
