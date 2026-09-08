import { useEffect, useState } from 'react';
import { createStoreHooks, localStorageAdapter, useHydrated } from 'use-everywhere';
import { Card, Page } from '../shell/Page.js';
import { Code } from '../shell/Code.js';

const KEY = 'use-everywhere:showcase-settings';

/**
 * Module scope, before anything renders — which is the rule, and the reason the
 * lint plugin has a rule about it. Registering after the store exists would
 * hand back a store with no persistence and warn (UE2002).
 */
const settings = createStoreHooks<{ nickname: string; density: 'cosy' | 'compact' }>(
  'showcase-settings',
  { persist: localStorageAdapter(KEY), persistDebounceMs: 150 },
);

export function PersistencePage() {
  const [nickname, setNickname] = settings.useSharedState('nickname', '');
  const [density, setDensity] = settings.useSharedState('density', 'cosy');
  const ready = useHydrated({ store: 'showcase-settings' });
  const [disk, setDisk] = useState<string | null>(null);

  // Read straight from localStorage rather than mirroring the store: the point
  // of the panel is to show what actually landed on disk, including the debounce.
  useEffect(() => {
    const read = () => setDisk(localStorage.getItem(KEY));
    read();
    const timer = setInterval(read, 250);
    return () => clearInterval(timer);
  }, []);

  return (
    <Page
      kicker="persist"
      title="Persistence"
      lede={
        <>
          State that survives a reload, and still converges with the tabs that stayed open. The
          interesting part is not the writing — it is what happens when disk and a live peer
          disagree.
        </>
      }
    >
      <Card title="A store bound to localStorage" aside={ready ? 'hydrated' : 'restoring…'}>
        <div className="row">
          <input
            type="text"
            value={nickname}
            placeholder="Your name — reload and it is still here"
            onChange={(event) => setNickname(event.target.value)}
            style={{ flex: 1 }}
          />
        </div>
        <div className="row">
          {(['cosy', 'compact'] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={density === option ? 'primary' : ''}
              onClick={() => setDensity(option)}
            >
              {option}
            </button>
          ))}
          <button type="button" className="ghost" onClick={() => location.reload()}>
            reload this tab
          </button>
          <button
            type="button"
            className="danger ghost"
            onClick={() => {
              localStorage.removeItem(KEY);
              location.reload();
            }}
          >
            wipe the disk
          </button>
        </div>
      </Card>

      <Card title="What is actually on disk" aside={`localStorage['${KEY}']`}>
        <pre style={{ margin: 0, fontSize: 12, overflowX: 'auto', color: 'var(--ink-soft)' }}>
          {disk ? JSON.stringify(JSON.parse(disk), null, 2) : '(nothing written yet)'}
        </pre>
        <p className="hint">
          Note the <code>versions</code> alongside the state. That is what makes a restore safe: a
          value read from disk carries the clock it was written with, so a tab that has been open
          the whole time — and has moved on — is not overwritten by an older value that merely
          arrived later.
        </p>
      </Card>

      <Code>{`const settings = createStoreHooks('settings', {
  persist: localStorageAdapter('my-app:settings'),
  persistVersion: 2,
  migrate: (state, from) => (from < 2 ? { ...state, density: 'cosy' } : state),
});

function Preferences() {
  const ready = useHydrated({ store: 'settings' });
  const [nickname, setNickname] = settings.useSharedState('nickname', '');
  …
}`}</Code>

      <div className="note">
        <strong>Try this:</strong> open two tabs, type a name, then <em>wipe the disk</em> in one of
        them and reload it. It comes back empty for a moment and then fills in from the tab that was
        already open — a late joiner is answered by a peer, not by the disk. The disk only wins when
        nobody is left to ask.
      </div>

      <div className="note">
        <strong>IndexedDB too:</strong> <code>indexedDbAdapter()</code> swaps in where the values
        are bigger than localStorage's budget, and <code>await store.hydrated</code> is how you gate
        first paint on an async restore.
      </div>
    </Page>
  );
}
