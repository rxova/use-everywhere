import { defineStore, localStorageAdapter } from 'use-everywhere';

/**
 * Module scope, before anything renders — which is the point: defineStore
 * registers how the store is built, so the value is restored before the first
 * paint rather than flashing the initial and then correcting itself.
 */
const drafts = defineStore<{ body: string }>('drafts', {
  persist: localStorageAdapter('ue-demo:drafts'),
  persistDebounceMs: 150,
});

export function PersistDemo() {
  const [body, setBody] = drafts.useSharedState('body', '');

  return (
    <section className="card">
      <h2>Persisted draft</h2>
      <p className="hint">
        Syncs across tabs like any shared state — but this store has a disk. Type something, close{' '}
        <em>every</em> tab, and reopen: it is still here, on the first frame.
      </p>

      <textarea
        data-testid="draft"
        rows={3}
        value={body}
        placeholder="type here…"
        onChange={(e) => setBody(e.target.value)}
        style={{ width: '100%', fontFamily: 'inherit' }}
      />

      <p>
        <button data-testid="clear-draft" onClick={() => setBody('')}>
          clear
        </button>
      </p>
    </section>
  );
}
