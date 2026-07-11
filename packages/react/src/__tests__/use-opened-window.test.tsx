import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WindowClosedError, type OpenedWindow } from '@use-everywhere/core';
import { useOpenedWindow } from '../use-opened-window.js';

type Out = { order: { id: string } };
type In = { progress: { step: string } };
type Receipt = { receiptId: string };

function fakeOpened() {
  let resolveReady!: () => void;
  let resolveResult!: (r: Receipt) => void;
  let rejectResult!: (err: unknown) => void;
  const ready = new Promise<void>((res) => (resolveReady = res));
  const result = new Promise<Receipt>((res, rej) => ((resolveResult = res), (rejectResult = rej)));
  result.catch(() => {});
  const opened: OpenedWindow<Out, In, Receipt> = {
    window: {} as OpenedWindow<Out, In, Receipt>['window'],
    ready,
    result,
    closed: new Promise<void>(() => {}),
    post: vi.fn(),
    on: vi.fn(() => () => {}),
    close: vi.fn(),
  };
  return { opened, resolveReady, resolveResult, rejectResult };
}

function Harness({ factory }: { factory: () => OpenedWindow<Out, In, Receipt> }) {
  const flow = useOpenedWindow<Out, In, Receipt>(factory);
  return (
    <>
      <span data-testid="status">{flow.status}</span>
      <span data-testid="result">{flow.result?.receiptId ?? ''}</span>
      <span data-testid="error">{flow.error instanceof Error ? flow.error.name : ''}</span>
      <button data-testid="open" onClick={flow.open} />
      <button data-testid="post" onClick={() => flow.post('order', { id: 'o1' })} />
      <button data-testid="close" onClick={flow.close} />
    </>
  );
}

const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));
const status = () => screen.getByTestId('status').textContent;

describe('useOpenedWindow', () => {
  it('walks idle → opening → connected → done and exposes the result', async () => {
    const fake = fakeOpened();
    render(<Harness factory={() => fake.opened} />);
    expect(status()).toBe('idle');

    act(() => screen.getByTestId('open').click());
    expect(status()).toBe('opening');

    fake.resolveReady();
    await flush();
    expect(status()).toBe('connected');

    fake.resolveResult({ receiptId: 'r-1' });
    await flush();
    expect(status()).toBe('done');
    expect(screen.getByTestId('result').textContent).toBe('r-1');
  });

  it("maps WindowClosedError to 'closed-early' and other errors to 'error'", async () => {
    const closedEarly = fakeOpened();
    const { unmount } = render(<Harness factory={() => closedEarly.opened} />);
    act(() => screen.getByTestId('open').click());
    closedEarly.rejectResult(new WindowClosedError());
    await flush();
    expect(status()).toBe('closed-early');
    expect(screen.getByTestId('error').textContent).toBe('WindowClosedError');
    unmount();

    const failed = fakeOpened();
    render(<Harness factory={() => failed.opened} />);
    act(() => screen.getByTestId('open').click());
    failed.rejectResult(new Error('popup blocked'));
    await flush();
    expect(status()).toBe('error');
  });

  it("reports 'error' when the factory itself throws", () => {
    render(
      <Harness
        factory={() => {
          throw new Error('misconfigured');
        }}
      />,
    );
    act(() => screen.getByTestId('open').click());
    expect(status()).toBe('error');
    expect(screen.getByTestId('error').textContent).toBe('Error');
  });

  it('a ready landing after the result keeps the final status', async () => {
    const fake = fakeOpened();
    render(<Harness factory={() => fake.opened} />);
    act(() => screen.getByTestId('open').click());

    fake.resolveResult({ receiptId: 'r-2' });
    await flush();
    expect(status()).toBe('done');

    fake.resolveReady(); // late ready must not regress 'done' to 'connected'
    await flush();
    expect(status()).toBe('done');
  });

  it('ignores a stale ready after reopening', async () => {
    const first = fakeOpened();
    const second = fakeOpened();
    const windows = [first, second];
    render(<Harness factory={() => windows.shift()!.opened} />);

    act(() => screen.getByTestId('open').click());
    act(() => screen.getByTestId('open').click()); // replace before first connects

    first.resolveReady();
    await flush();
    expect(status()).toBe('opening'); // still waiting on the second window
  });

  it('forwards post/close to the current window and ignores a stale one on reopen', async () => {
    const first = fakeOpened();
    const second = fakeOpened();
    const windows = [first, second];
    render(<Harness factory={() => windows.shift()!.opened} />);

    act(() => screen.getByTestId('post').click()); // nothing open yet: no-op
    expect(first.opened.post).not.toHaveBeenCalled();

    act(() => screen.getByTestId('open').click());
    act(() => screen.getByTestId('post').click());
    expect(first.opened.post).toHaveBeenCalledWith('order', { id: 'o1' });

    act(() => screen.getByTestId('open').click()); // reopen: closes and replaces the first
    expect(first.opened.close).toHaveBeenCalled();

    first.resolveResult({ receiptId: 'stale' }); // stale outcome must be ignored
    await flush();
    expect(status()).toBe('opening');

    act(() => screen.getByTestId('close').click());
    expect(second.opened.close).toHaveBeenCalled();
  });
});
