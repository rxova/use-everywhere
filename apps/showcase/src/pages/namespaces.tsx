import { createNamespace, useSharedState } from 'use-everywhere';
import { Card, Page } from '../shell/Page.js';
import { Code } from '../shell/Code.js';

/**
 * Module scope, and two of them: this is what two independently deployed
 * micro-frontends would each do in their own bundle, without knowing about
 * each other.
 */
const checkout = createNamespace('checkout');
const inbox = createNamespace('inbox');

export function NamespacesPage() {
  const [checkoutTotal, setCheckoutTotal] = checkout.useSharedState('total', 0);
  const [inboxTotal, setInboxTotal] = inbox.useSharedState('total', 0);
  const [globalTotal, setGlobalTotal] = useSharedState('total', 0);

  return (
    <Page
      kicker="createNamespace"
      title="Namespaces"
      lede={
        <>
          A <code>BroadcastChannel</code> is global to the origin, so a bus name <em>is</em> an
          identity. Two apps that both call their store <code>total</code> are not two totals — they
          are one, with two teams writing to it.
        </>
      }
    >
      <Card title="Three stores, one key name" aside="'total' in each">
        <div className="row">
          <span className="tag">checkout</span>
          <button type="button" onClick={() => setCheckoutTotal((n) => n + 1)}>
            +1
          </button>
          <code>{checkoutTotal}</code>
        </div>
        <div className="row">
          <span className="tag">inbox</span>
          <button type="button" onClick={() => setInboxTotal((n) => n + 1)}>
            +1
          </button>
          <code>{inboxTotal}</code>
        </div>
        <div className="row">
          <span className="tag">no namespace</span>
          <button type="button" onClick={() => setGlobalTotal((n) => n + 1)}>
            +1
          </button>
          <code>{globalTotal}</code>
        </div>
        <p className="hint">
          Each moves on its own, in every tab. Without the namespaces the first two would be the
          same number — and nothing would warn, because from the library's side that is
          indistinguishable from the case it exists to serve: two tabs sharing state.
        </p>
      </Card>

      <Card title="What a namespace actually is" aside="a prefix, plus the hooks">
        <p className="hint" style={{ marginTop: 0 }}>
          <code>createNamespace('checkout')</code> returns the whole API with every bus name
          prefixed: stores, channels, presence, leadership. Two micro-frontends on the defaults stop
          colliding, and each still gets its own leader seat rather than fighting over one.
        </p>
        <p className="hint">
          It is also what makes the alternative visible in devtools: the Inspector shows which bus a
          wire belongs to, so "why is my cart changing" has an answer instead of a hunch.
        </p>
      </Card>

      <Code>{`// checkout-mfe/store.ts
export const checkout = createNamespace('checkout');

// anywhere in that MFE
const [total, setTotal] = checkout.useSharedState('total', 0);
const { isLeader } = checkout.useLeader();`}</Code>

      <div className="note">
        <strong>Several copies of the library on one page.</strong> Module federation and single-spa
        routinely load two bundles that each contain their own copy. They rendezvous: one presence
        entry, one leader seat, and synchronous delivery between them — provided the copies are
        compatible. If they are not, it says so (<code>UE1008</code>) rather than quietly behaving
        like two strangers.
      </div>
    </Page>
  );
}
