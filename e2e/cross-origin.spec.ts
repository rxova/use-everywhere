import { expect, test, type Page } from '@playwright/test';

/**
 * The flagship feature, and until now the one with no end-to-end coverage: a
 * window on *another origin* that reports a result back.
 *
 * The demo reaches one Vite server through two hostnames — `localhost` and
 * `127.0.0.1` are different origins to a browser — so this genuinely exercises
 * the postMessage path, the handshake, and the origin/nonce/source gates. None
 * of it can fall back to BroadcastChannel.
 */
const payButton = (page: Page) => page.getByTestId('pay-button');
const paymentStatus = (page: Page) => page.getByTestId('payment-status');

/** Open the payment popup and wait for it to finish its handshake. */
async function startPayment(shop: Page) {
  const popupPromise = shop.context().waitForEvent('page');
  await payButton(shop).click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  // The order details only arrive over the channel — the heading proves the
  // handshake completed and a typed message crossed origins.
  await expect(popup.getByTestId('order-heading')).toContainText('Order #', { timeout: 15_000 });
  return popup;
}

test.describe('cross-origin payment window', () => {
  test.beforeEach(async ({ context }) => {
    const page = await context.newPage();
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.close();
  });

  test('the child reports a receipt back across origins', async ({ context }) => {
    const shop = await context.newPage();
    await shop.goto('/');

    const popup = await startPayment(shop);
    expect(new URL(popup.url()).origin).not.toBe(new URL(shop.url()).origin);

    await popup.getByTestId('card-input').fill('4242424242424242');
    await popup.getByTestId('charge-button').click();

    // finish() on the child resolves the opener's result, which the checkout
    // folds into shared state — the whole round trip.
    await expect(paymentStatus(shop)).toContainText('paid', { timeout: 20_000 });
    await expect(paymentStatus(shop)).toContainText('4242');

    await shop.close();
  });

  test('closing the window mid-payment unlocks the checkout', async ({ context }) => {
    const shop = await context.newPage();
    await shop.goto('/');

    const popup = await startPayment(shop);
    await expect(paymentStatus(shop)).toContainText('complete the payment');

    await popup.close(); // user gives up

    // WindowClosedError, surfaced as 'closed-early' — the button must come back
    // rather than stranding the checkout in 'processing' forever.
    await expect(paymentStatus(shop)).toContainText('closed before finishing', { timeout: 20_000 });
    await expect(payButton(shop)).toBeEnabled();

    await shop.close();
  });

  test('the lock is shared: paying in one tab locks the others', async ({ context }) => {
    const shop = await context.newPage();
    await shop.goto('/');
    const other = await context.newPage();
    await other.goto('/');

    const popup = await startPayment(shop);

    // The lock rides on shared state, so the second tab sees it without ever
    // touching the payment window.
    await expect(paymentStatus(other)).toContainText('payment in progress', { timeout: 10_000 });
    await expect(payButton(other)).toBeDisabled();

    await popup.close();
    await expect(payButton(other)).toBeEnabled({ timeout: 20_000 });

    await shop.close();
    await other.close();
  });

  test('a page opened directly, with no opener, refuses to connect', async ({ context }) => {
    const direct = await context.newPage();
    await direct.goto('/payment.html');

    // connectToOpener throws without an opener and without the cid parameter;
    // the demo catches it and says so rather than half-connecting.
    await expect(direct.getByText('must be opened from the checkout demo')).toBeVisible();

    await direct.close();
  });
});
