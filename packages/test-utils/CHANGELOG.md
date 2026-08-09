# @use-everywhere/test-utils

## 0.1.4

### Patch Changes

- [#81](https://github.com/rxova/use-everywhere/pull/81) [`1359739`](https://github.com/rxova/use-everywhere/commit/13597395e79859e4c72c10146e1ce1825c67c9f6) - Ship an `llms.txt` in the package tarball. It is what a coding agent reads out of `node_modules` after an install: what the package is, how to install it, a working example, the public surface, and the mistakes that are silent at runtime. `check-llms.ts` checks its API table against the package's real entry points, so a renamed export fails the build rather than leaving the file describing an API that no longer exists.

- [#84](https://github.com/rxova/use-everywhere/pull/84) [`3edf05b`](https://github.com/rxova/use-everywhere/commit/3edf05bfac57c6e023ef1b0a1b6fb863a91efb66) - Point `homepage` at the testing guide, and broaden `keywords`.

  `homepage` is the link npm renders on the package page, so it was sending everyone who arrived from the registry to a README instead of the documentation. The keywords described the mechanism (`broadcastchannel`, `cross-tab`) but not the problem, so none of them matched what someone with the bug actually searches for — added the vocabulary that side uses, plus `broadcast-channel`, which npm treats as a different term from the unhyphenated spelling already listed.

- Updated dependencies [[`1359739`](https://github.com/rxova/use-everywhere/commit/13597395e79859e4c72c10146e1ce1825c67c9f6), [`3edf05b`](https://github.com/rxova/use-everywhere/commit/3edf05bfac57c6e023ef1b0a1b6fb863a91efb66)]:
  - @use-everywhere/core@0.11.1

## 0.1.3

### Patch Changes

- Updated dependencies [[`96a7e3f`](https://github.com/rxova/use-everywhere/commit/96a7e3fcad42d535d88274f8e51c7507d285156d)]:
  - @use-everywhere/core@0.11.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`d97248b`](https://github.com/rxova/use-everywhere/commit/d97248b1cbdb8a431783ef37a96a69296230d425)]:
  - @use-everywhere/core@0.10.1

## 0.1.1

### Patch Changes

- Updated dependencies [[`6c7ab4b`](https://github.com/rxova/use-everywhere/commit/6c7ab4bac60f360f65c5fd2dfacd02fba55b3274)]:
  - @use-everywhere/core@0.10.0

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
