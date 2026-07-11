/** Messages opener → payment window. */
export type ToPayment = {
  order: { orderId: string; label: string; amount: string };
};

/** Messages payment window → opener. */
export type FromPayment = {
  progress: { step: string };
};

/** Terminal result delivered by finish(). */
export type Receipt = { receiptId: string; last4: string };
