import { useEffect, useMemo, useState } from 'react';
import { connectToOpener, type OpenerConnection } from '@use-everywhere/core';
import { otherOrigin } from '../origins.js';
import type { FromPayment, Receipt, ToPayment } from '../payment-types.js';

type Conn = OpenerConnection<ToPayment, FromPayment, Receipt>;

// Module-level singleton: survives StrictMode double-mounting.
let cached: Conn | null | undefined;
function getConnection(): Conn | null {
  if (cached === undefined) {
    try {
      cached = connectToOpener<ToPayment, FromPayment, Receipt>({ peerOrigin: otherOrigin() });
    } catch {
      cached = null; // opened directly, not via openWindow()
    }
  }
  return cached;
}

export function PaymentPage() {
  const conn = useMemo(getConnection, []);
  const [order, setOrder] = useState<ToPayment['order'] | null>(null);
  const [card, setCard] = useState('');
  const [state, setState] = useState<'form' | 'charging' | 'done'>('form');

  useEffect(() => {
    if (!conn) return;
    return conn.on('order', setOrder);
  }, [conn]);

  if (!conn) {
    return (
      <div className="wrap">
        <h1>Secure payment</h1>
        <p className="tagline">
          This page must be opened from the checkout demo — it has no opener window to
          report the payment back to.
        </p>
      </div>
    );
  }

  const chargeable = card.replace(/\D/g, '').length >= 12 && state === 'form';

  const chargeCard = async () => {
    setState('charging');
    conn.post('progress', { step: 'charging' });
    await new Promise((resolve) => setTimeout(resolve, 1500)); // the "bank"
    setState('done');
    conn.finish({
      receiptId: `r-${Math.random().toString(36).slice(2, 8)}`,
      last4: card.replace(/\D/g, '').slice(-4),
    });
    setTimeout(() => conn.close(), 1200); // let the user see the confirmation
  };

  return (
    <div className="wrap" style={{ maxWidth: 420 }}>
      <h1 style={{ fontSize: 24 }}>Secure payment</h1>
      <p className="tagline">
        You are on <code style={{ fontFamily: 'var(--mono)' }}>{location.origin}</code> — a different
        origin than the shop that opened this window.
      </p>
      <div className="card" style={{ marginTop: 20 }}>
        <h2>{order ? `Order #${order.orderId}` : 'Waiting for order details…'}</h2>
        {order && (
          <>
            <div className="order-line">
              <span>{order.label}</span>
              <span>{order.amount}</span>
            </div>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Card number (demo — type any 12+ digits)"
              value={card}
              onChange={(e) => setCard(e.target.value)}
              disabled={state !== 'form'}
              style={{ marginTop: 14 }}
            />
            <button className="pay" onClick={chargeCard} disabled={!chargeable}>
              {state === 'form' && `Pay ${order.amount}`}
              {state === 'charging' && 'Charging…'}
              {state === 'done' && '✓ Paid — returning you to the shop'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
