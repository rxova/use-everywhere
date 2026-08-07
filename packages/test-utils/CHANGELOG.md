# @use-everywhere/test-utils

## 0.1.0

### Minor Changes

- [#64](https://github.com/rxova/use-everywhere/pull/64) [`9aa146f`](https://github.com/rxova/use-everywhere/commit/9aa146fbe9d6ada23377e8e1e3645657754bcb04) - First release: run several simulated tabs in one process, with no browser and
  no globals.

  `createScenario()` is one simulated browser — a hub every tab shares, a
  `navigator.locks` stand-in every tab queues on, and tabs that can be closed
  _or_ crashed. The difference is the whole reason multi-tab code is hard: a tab
  that closes says goodbye, and a tab that crashes leaves peers to notice.

  ```ts
  const browser = createScenario();
  const a = browser.tab();
  const survivor = browser.tab().leader('app');
  a.leader('app');

  await browser.settle();
  a.crash(); // no goodbye, and the lock the dead tab held is reclaimed

  expect(survivor.getSnapshot().isLeader).toBe(true);
  ```

  Also published: `FakeLockManager`, `FakeWindow`/`fakeWindowPair` for the
  window-channel seams, `tick`/`snapshotWindow`, and `MemoryHub`/`MemoryTransport`
  re-exported from `@use-everywhere/core/testing` so a test needs one import.

### Patch Changes

- Updated dependencies [[`9aa146f`](https://github.com/rxova/use-everywhere/commit/9aa146fbe9d6ada23377e8e1e3645657754bcb04), [`2ee96f4`](https://github.com/rxova/use-everywhere/commit/2ee96f4bfd87c08b83c2849a6b242a5b5881dff4)]:
  - @use-everywhere/core@0.9.0
