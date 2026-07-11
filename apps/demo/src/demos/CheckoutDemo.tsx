import { useEffect } from 'react';
import { openWindow, useClientId, useOpenedWindow, useSharedState } from 'use-everywhere';
import { otherOrigin } from '../origins.js';
import type { FromPayment, Receipt, ToPayment } from '../payment-types.js';

const ORDER = { orderId: '48-291', label: 'Concurrentree Pro (1 yr)', amount: '$69.03' };

type PaymentState = 'idle' | 'processing' | 'paid';

export function CheckoutDemo() {
  const clientId = useClientId();
  // Shared across every tab: press Pay here and the other tab locks instantly.
  const [payment, setPayment] = useSharedState<PaymentState>('payment', 'idle');
  const [payingTab, setPayingTab] = useSharedState<string | null>('payingTab', null);
  const [receipt, setReceipt] = useSharedState<Receipt | null>('receipt', null);

  const pay = useOpenedWindow<ToPayment, FromPayment, Receipt>(() =>
    openWindow(`${otherOrigin()}/payment.html`, {
      peerOrigin: otherOrigin(),
      features: 'popup,width=440,height=640',
    }),
  );
  const { status: payStatus, result: payResult, post: payPost } = pay;

  // Once the payment window is connected, hand it the order details.
  useEffect(() => {
    if (payStatus === 'connected') payPost('order', ORDER);
  }, [payStatus, payPost]);

  // Fold the window's outcome back into the cross-tab state machine.
  useEffect(() => {
    if (payStatus === 'done' && payResult) {
      setReceipt(payResult);
      setPayment('paid');
    } else if (payStatus === 'closed-early' || payStatus === 'error') {
      setPayment('idle');
      setPayingTab(null);
    }
  }, [payStatus, payResult, setReceipt, setPayment, setPayingTab]);

  const startPayment = () => {
    if (payment !== 'idle') return;
    setPayment('processing');
    setPayingTab(clientId);
    pay.open();
  };

  const reset = () => {
    setPayment('idle');
    setPayingTab(null);
    setReceipt(null);
  };

  const mine = payingTab === clientId;

  return (
    <div className="card" style={{ maxWidth: 420 }}>
      <h2>Cross-origin payment window (+ duplicate-tab lock)</h2>
      <div className="order-line">
        <span>{ORDER.label}</span>
        <span>{ORDER.amount}</span>
      </div>
      <div className="order-line total">
        <span>Total</span>
        <span>{ORDER.amount}</span>
      </div>
      <button className="pay" onClick={startPayment} disabled={payment !== 'idle'}>
        {payment === 'idle' && `Pay ${ORDER.amount} in secure window`}
        {payment === 'processing' && 'Processing…'}
        {payment === 'paid' && 'Paid'}
      </button>
      <div
        className={`status ${payment === 'processing' ? 'processing' : ''} ${payment === 'paid' ? 'paid' : ''}`}
      >
        {payment === 'processing' &&
          (mine
            ? '⏳ complete the payment in the opened window…'
            : `🔒 payment in progress in tab ${payingTab}`)}
        {payment === 'paid' &&
          receipt &&
          `✓ paid — receipt ${receipt.receiptId} (card •••• ${receipt.last4})`}
        {pay.status === 'closed-early' &&
          payment === 'idle' &&
          'payment window closed before finishing'}
      </div>
      <button className="reset" onClick={reset}>
        reset demo
      </button>
      <p className="hint">
        The payment page opens on <code style={{ fontFamily: 'var(--mono)' }}>{otherOrigin()}</code>{' '}
        — a different origin, so this runs on postMessage with origin + nonce checks, not
        BroadcastChannel.
      </p>
    </div>
  );
}
