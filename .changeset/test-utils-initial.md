---
'@use-everywhere/test-utils': minor
---

First release: run several simulated tabs in one process, with no browser and
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
