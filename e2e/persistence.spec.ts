import { expect, test, type Page } from '@playwright/test';

const draft = (page: Page) => page.getByTestId('draft');

test.describe('persistence, in real tabs', () => {
  test.beforeEach(async ({ context }) => {
    // Each test starts from a clean disk.
    const page = await context.newPage();
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.close();
  });

  test('the value survives closing every tab', async ({ context }) => {
    const first = await context.newPage();
    await first.goto('/');
    await draft(first).fill('survives the last tab');
    await first.waitForTimeout(400); // past the 150ms debounce
    await first.close();

    // Not a reload — every tab is gone. Nothing is holding this in memory.
    const reopened = await context.newPage();
    await reopened.goto('/');

    // On the first frame, with no flash of the empty initial: the store is
    // hydrated during construction, before any hook can register the key.
    await expect(draft(reopened)).toHaveValue('survives the last tab');

    await reopened.close();
  });

  test('the restored value never flashes the initial', async ({ context }) => {
    const seed = await context.newPage();
    await seed.goto('/');
    await draft(seed).fill('no flash');
    await seed.waitForTimeout(400);
    await seed.close();

    const page = await context.newPage();

    // Sample the field the moment it exists. If hydration lost the race with
    // the hook's initial we would catch an empty string here.
    await page.goto('/');
    const firstSeen = await draft(page).inputValue();

    expect(firstSeen).toBe('no flash');

    await page.close();
  });

  test('a live tab still sees a write from another tab', async ({ context }) => {
    const a = await context.newPage();
    const b = await context.newPage();
    await a.goto('/');
    await b.goto('/');

    await draft(a).fill('typed in tab A');

    await expect(draft(b)).toHaveValue('typed in tab A', { timeout: 5_000 });

    for (const tab of [a, b]) await tab.close();
  });

  test('a newer live tab beats what is on disk', async ({ context }) => {
    // Put something on disk.
    const seed = await context.newPage();
    await seed.goto('/');
    await draft(seed).fill('old, from disk');
    await seed.waitForTimeout(400);
    await seed.close();

    // A live tab moves the value on — its version now outranks the stored one.
    const live = await context.newPage();
    await live.goto('/');
    await expect(draft(live)).toHaveValue('old, from disk');
    await draft(live).fill('newer, from a live tab');
    await live.waitForTimeout(400);

    // A tab joining now hydrates from disk *and* hears the live tab. The newer
    // version wins, and both converge — nobody is left disagreeing.
    const joiner = await context.newPage();
    await joiner.goto('/');

    await expect(draft(joiner)).toHaveValue('newer, from a live tab', { timeout: 5_000 });
    await expect(draft(live)).toHaveValue('newer, from a live tab');

    for (const tab of [live, joiner]) await tab.close();
  });

  test('clearing is persisted too', async ({ context }) => {
    const page = await context.newPage();
    await page.goto('/');
    await draft(page).fill('to be cleared');
    await page.waitForTimeout(400);

    await page.getByTestId('clear-draft').click();
    await page.waitForTimeout(400);
    await page.close();

    const reopened = await context.newPage();
    await reopened.goto('/');

    // The clear was a write like any other, with a higher version — it must not
    // be undone by the restore.
    await expect(draft(reopened)).toHaveValue('');

    await reopened.close();
  });
});
