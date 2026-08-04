import { getBus } from './bus.js';
import { isVersion, newer } from './clock.js';
import { devWarn } from './dev.js';
import { freezeShared } from './dev-freeze.js';
import type { MessageMeta, Version } from './common.types.js';
import type { Persisted, RestoreError } from './persist.types.js';
import { createGate } from './schema.js';
import type { SharedStore, SharedStoreOptions } from './shared-store.types.js';

// Live-store count per name on the shared (registry) bus, to catch the
// two-stores-one-name mistake. Custom transports are exempt: in tests every
// store is deliberately its own simulated client on the same name.
const liveStores = new Map<string, number>();

/**
 * State synced across every same-origin tab/window/worker: per-key
 * last-writer-wins version clocks and a hello/snapshot late-joiner handshake.
 * Create at most one store per name per tab (the React package memoizes).
 */
export function createSharedStore<S extends Record<string, unknown>>(
  name: string,
  initial: S,
  options: SharedStoreOptions<S> = {},
): SharedStore<S> {
  const onSharedBus = !options.transport;
  if (onSharedBus) {
    const live = liveStores.get(name) ?? 0;
    if (live > 0) {
      if (process.env.NODE_ENV !== 'production') {
        devWarn(
          `[use-everywhere] second shared store for "${name}" in this tab — they stay in sync, but you are paying twice for one store's state, subscriptions, and persistence writes. Reuse one per name.`,
        );
      }
    }
    liveStores.set(name, live + 1);
  }
  const bus = getBus(name, options);
  const clientId = bus.clientId;
  const accept = options.accept;
  const gate = createGate(name, options.schema, options.onInvalid);

  const state: Record<string, unknown> = { ...initial };
  const versions: Record<string, Version> = {};
  for (const k in state) {
    versions[k] = [0, clientId];
    freezeShared(state[k]); // dev-only: catch accidental in-place mutation early
  }
  let snapshot: Readonly<S> = Object.freeze({ ...state }) as S;
  let versionsSnapshot: Readonly<Record<string, Version>> = Object.freeze({ ...versions });

  const listeners = new Set<(key: keyof S & string, value: unknown, meta: MessageMeta) => void>();
  const keyListeners = new Map<string, Set<() => void>>();

  /** Depth, not a flag: transactions nest, and only the outermost one flushes. */
  let batchDepth = 0;
  /** Changes applied inside the current batch, in the order they happened. */
  const batched: [key: string, value: unknown, meta: MessageMeta][] = [];

  const rebuild = () => {
    snapshot = Object.freeze({ ...state }) as S;
    versionsSnapshot = Object.freeze({ ...versions });
  };

  const emit = (key: string, value: unknown, meta: MessageMeta) => {
    for (const fn of listeners) fn(key as keyof S & string, value, meta);
    const set = keyListeners.get(key);
    if (set) for (const fn of set) fn();
  };

  function notify(key: string, value: unknown, meta: MessageMeta) {
    if (batchDepth > 0) {
      batched.push([key, value, meta]);
      return;
    }
    rebuild();
    emit(key, value, meta);
  }

  /**
   * Apply a group of changes, then rebuild and announce once.
   *
   * Rebuilding the snapshot is O(keys), and doing it per key made applying a
   * K-key snapshot O(K²) — which is what a late joiner triggers in every peer,
   * once per peer. Batching makes it O(K).
   *
   * It also fixes something subtler: a subscriber called mid-loop used to see a
   * half-applied snapshot, because the rebuild happened before each key rather
   * than after all of them. Now every listener sees the settled state.
   */
  function batch<T>(fn: () => T): T {
    batchDepth++;
    try {
      return fn();
    } finally {
      batchDepth--;
      if (batchDepth === 0 && batched.length > 0) {
        const changes = batched.splice(0, batched.length);
        rebuild();
        for (const [key, value, meta] of changes) emit(key, value, meta);
      }
    }
  }

  function applyRemote(key: string, value: unknown, version: Version, meta: MessageMeta) {
    if (!newer(version, versions[key])) return;
    // After the clock, before the write. Checking a value that loses
    // last-writer-wins anyway would spend the work for nothing and report a
    // peer's payload as broken when this tab was never going to use it.
    //
    // Every way a value enters this store from outside the running build funnels
    // through here — a peer's patch, a snapshot, and the restore from disk,
    // which is the one that matters most: state written by last month's deploy
    // is the version-skew problem with a longer fuse.
    if (gate && !gate.accepts(key, value)) return;
    versions[key] = version;
    state[key] = freezeShared(value);
    notify(key, value, meta);
  }

  /**
   * Answering a `hello` after a random pause, and only if nobody else did.
   *
   * Every peer used to answer every joiner with a full snapshot. Opening one
   * tab in a room of twenty therefore produced twenty full copies of the state
   * on the wire, each of which the joiner then applied — and each peer paid to
   * serialise its whole state. The cost of joining scaled with how many people
   * were already there, which is backwards.
   *
   * The pause is jittered so peers do not all fire at once, and the first
   * snapshot to land cancels everyone else's. One reply, whoever is quickest.
   * Nobody is elected and no leader is required: a room where every peer is
   * equally able to answer should not need a seat to decide who does.
   */
  const snapshotDelayMs = options.snapshotDelayMs ?? 40;
  let snapshotTimer: ReturnType<typeof setTimeout> | undefined;

  /** Keys this client has actually written. Counter 0 is a registered initial, not data. */
  const written = () => Object.keys(versions).filter((k) => (versions[k]?.[0] ?? 0) > 0);

  /**
   * Stand down only for a snapshot that says everything this one would.
   *
   * Cancelling on *any* snapshot looked right and was not: a joiner that has
   * nothing yet also answers `hello`s, and its empty snapshot would silence the
   * peer holding the actual state. Nobody would be wrong, and everybody would be
   * empty until the next write.
   */
  const coveredBy = (theirs: Record<string, Version>) =>
    written().every((key) => {
      const mine = versions[key];
      return mine !== undefined && !newer(mine, theirs[key]);
    });

  const cancelSnapshot = () => {
    clearTimeout(snapshotTimer);
    snapshotTimer = undefined;
  };

  const scheduleSnapshot = () => {
    // Nothing written here is nothing a joiner needs, and answering anyway
    // would only crowd out a peer that does have something.
    if (written().length === 0) return;
    // Already about to answer: one broadcast serves every joiner waiting.
    if (snapshotTimer !== undefined) return;
    snapshotTimer = setTimeout(() => {
      snapshotTimer = undefined;
      bus.post({
        v: 1,
        scope: 'state',
        type: 'snapshot',
        clientId,
        kind: bus.kind,
        state: { ...state },
        versions: { ...versions },
      });
    }, Math.random() * snapshotDelayMs);
  };

  const unsubscribe = bus.subscribe((wire) => {
    if (wire.scope !== 'state') return;
    const meta: MessageMeta = { clientId: wire.clientId, kind: wire.kind, self: false };
    if (wire.type === 'hello') {
      scheduleSnapshot();
      return;
    }
    if (accept && !accept(meta)) return;
    if (wire.type === 'patch') {
      // The version is a claim until it is checked: a malformed one used to
      // reach newer() and throw inside this handler, taking the tab's bus down
      // with it. A wire we cannot arbitrate is one we drop.
      if (typeof wire.key !== 'string' || !isVersion(wire.version)) return;
      applyRemote(wire.key, wire.value, wire.version, meta);
      return;
    }
    if (wire.type === 'snapshot') {
      const versions = wire.versions;
      if (typeof versions !== 'object' || versions === null) return;
      // Somebody answered. Stand down only if they said everything this client
      // would have — otherwise the pending reply still has something to add.
      if (coveredBy(versions)) cancelSnapshot();
      batch(() => {
        for (const k in wire.state) {
          const version = versions[k];
          if (isVersion(version)) applyRemote(k, wire.state[k], version, meta);
        }
      });
      return;
    }
    // Named explicitly, where a bare `else` used to stand. Within one protocol
    // version new wire types are additive (see wire.ts), so a build that has
    // never heard of one must treat it as nothing — the `else` instead treated
    // every future `state` type as a snapshot, and it only failed to corrupt
    // anything because the versions-map check happened to reject it. That is
    // the difference between forward compatibility and luck.
  });

  function setKey(key: string, value: unknown) {
    // Before the version is even minted, for the same reason the clone
    // pre-check posts before committing: a write this tab cannot describe must
    // not land locally and then fail to travel.
    gate?.assert(key, value);
    const version: Version = [(versions[key]?.[0] ?? 0) + 1, clientId];
    // Post before committing locally: postMessage rejects non-cloneable values
    // (functions, DOM nodes, class instances) by throwing synchronously, and a
    // throw *after* the local write would leave this tab silently diverged
    // from every peer. Posting first makes the write all-or-nothing.
    try {
      bus.post({
        v: 1,
        scope: 'state',
        type: 'patch',
        key,
        value,
        version,
        clientId,
        kind: bus.kind,
      });
    } catch (error) {
      throw new TypeError(
        `use-everywhere: the value for key "${key}" cannot cross the wire (structured clone failed); the write was not applied. ${String(error)}`,
        { cause: error },
      );
    }
    versions[key] = version;
    state[key] = freezeShared(value);
    notify(key, value, { clientId, kind: bus.kind, self: true });
  }

  const proxy = new Proxy(state, {
    set(_target, key, value) {
      if (typeof key !== 'string') return false;
      setKey(key, value);
      return true;
    },
  }) as S;

  const persist = options.persist;
  let flushPersist: (() => void) | undefined;
  // Resolved once the restore has been applied, or immediately when there is
  // nothing to restore. Held here so `hydrated` can be handed out below whether
  // or not persistence is configured.
  let settle: () => void = () => {};
  const hydrated = persist
    ? new Promise<void>((resolve) => {
        settle = resolve;
      })
    : Promise.resolve();

  if (persist) {
    const {
      adapter,
      keys,
      debounceMs = 100,
      version: schemaVersion = 0,
      migrate,
      onRestoreError,
    } = persist;
    const shouldPersist = (key: string) => !keys || keys.includes(key);

    const refuse = (error: RestoreError) => {
      if (onRestoreError) onRestoreError(error);
      else if (process.env.NODE_ENV !== 'production') {
        devWarn(
          `[use-everywhere] ${name}: persisted schema v${error.found} not restored, ` +
            `expected v${error.expected} (${error.reason}). https://rxova.org/guides/persistence/`,
        );
      }
    };

    /**
     * Bring what is on disk to this build's schema version, or refuse it.
     *
     * Returns `undefined` for anything that must not be applied, which is the
     * same shape as "nothing was saved" — a refused restore leaves the store on
     * its initial values rather than on a half-understood past.
     */
    const reconcile = (
      saved: Persisted,
    ): { state: Record<string, unknown>; migrated: boolean } | undefined => {
      const found = saved.schema ?? 0;
      if (found === schemaVersion) return { state: saved.state, migrated: false };
      if (found > schemaVersion) {
        // An older build reading what a newer one wrote. It cannot be asked to
        // understand a shape that postdates it, and guessing would put values
        // it misreads back on the wire with winning clocks. Same call the
        // envelope makes for a protocol version it does not know.
        refuse({ reason: 'ahead', found, expected: schemaVersion });
        return undefined;
      }
      if (!migrate) {
        refuse({ reason: 'no-migrate', found, expected: schemaVersion });
        return undefined;
      }
      try {
        return { state: migrate(saved.state, found), migrated: true };
      } catch (cause) {
        // A throwing migration is a bug in the migration, and the one thing it
        // must not do is take the store down with it on every page load.
        refuse({ reason: 'migrate-threw', found, expected: schemaVersion, cause });
        return undefined;
      }
    };

    const hydrate = (raw: Persisted | undefined) => {
      const reconciled = raw && reconcile(raw);
      if (!reconciled || !raw) {
        settle();
        return;
      }
      const { state: restored, migrated } = reconciled;
      for (const key in restored) {
        // A migration that *adds* a key — deriving `fullName` from `first` and
        // `last`, the commonest migration there is — produces a value with no
        // clock on disk, because the key did not exist when that file was
        // written. Skipping it would silently drop exactly the thing the
        // migration was written to add.
        //
        // So it gets minted one: counter 1, this client. That is a real write
        // (counter >= 1 beats any registered initial) attributed to the tab that
        // computed it, and it still loses to a live tab holding something newer
        // — which is right, since live data outranks a migration of stale disk.
        // Two tabs migrating the same file compute the same value, so the
        // clientId tie-break between them is a coin toss with one outcome.
        const version = raw.versions[key] ?? (migrated ? ([1, clientId] as Version) : undefined);
        if (!version || !shouldPersist(key)) continue;
        // Through the same LWW gate as any remote write, so a live tab holding
        // something newer still wins. `accept` is deliberately bypassed: it
        // gates what other clients may tell us, and this is our own past.
        applyRemote(key, restored[key], version, { clientId, kind: bus.kind, self: true });
        // Re-broadcast, carrying the *persisted* version. Not an optimisation:
        // hello/snapshot only flows incumbent -> joiner, so a live tab sitting
        // on a staler value would never otherwise hear about the restored one,
        // and the two would diverge permanently. applyRemote gates on
        // wire.version and uses clientId only for meta, so this is legal.
        bus.post({
          v: 1,
          scope: 'state',
          type: 'patch',
          key,
          value: restored[key],
          version,
          clientId,
          kind: bus.kind,
        });
      }
      settle();
    };

    const collect = (): Persisted => {
      const out: Persisted = { v: 1, schema: schemaVersion, state: {}, versions: {} };
      for (const key in versions) {
        const version = versions[key];
        // Counter 0 means "registered, never written" — somebody's `initial`,
        // not data. Persisting it would let a restored initial lose to another
        // tab's initial on the clientId tie-break, which is a silent
        // divergence. Everything we write has counter >= 1, so it strictly
        // beats any [0, *] that registerKey can mint.
        if (!version || version[0] === 0 || !shouldPersist(key)) continue;
        out.state[key] = state[key];
        out.versions[key] = version;
      }
      return out;
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    flushPersist = () => {
      clearTimeout(timer);
      timer = undefined;
      void adapter.write(collect());
    };

    const saved = adapter.read();
    if (saved instanceof Promise) {
      void saved.then(hydrate);
    } else {
      hydrate(saved);
    }

    // Attached after hydration, or the restore would immediately re-persist
    // what it just read. Fires for local *and* remote writes, so every tab
    // keeps the converged state on disk.
    listeners.add(() => {
      if (timer !== undefined) return;
      timer = setTimeout(flushPersist as () => void, debounceMs);
    });

    if (typeof document !== 'undefined' && typeof addEventListener === 'function') {
      addEventListener('pagehide', flushPersist);
    }
  }

  const sayHello = () =>
    bus.post({ v: 1, scope: 'state', type: 'hello', clientId, kind: bus.kind });

  // A tab restored from bfcache missed every patch broadcast while it was
  // cached — with no re-handshake it would hold silently stale state until the
  // next write to each affected key. Re-run the late-joiner handshake: the
  // snapshot replies pass through the same LWW gate, so anything we hold that
  // is genuinely newer still survives.
  const onPageShow = (event: Event) => {
    if (!(event as { persisted?: boolean }).persisted) return;
    sayHello();
  };
  const hasWindow = typeof document !== 'undefined' && typeof addEventListener === 'function';
  if (hasWindow) addEventListener('pageshow', onPageShow);

  // Late-joiner handshake: ask everyone for their state.
  sayHello();

  let storeClosed = false;
  return {
    clientId,
    hydrated,
    state: proxy,
    getSnapshot: () => snapshot,
    getVersions: () => versionsSnapshot,
    set(key, value) {
      const next =
        typeof value === 'function' ? (value as (prev: unknown) => unknown)(state[key]) : value;
      setKey(key, next);
    },
    transaction(fn) {
      return batch(fn);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    subscribeKey(key, fn) {
      let set = keyListeners.get(key);
      if (!set) {
        set = new Set();
        keyListeners.set(key, set);
      }
      set.add(fn);
      return () => {
        set.delete(fn);
        // Drop the bucket with its last listener. Per-item keys
        // (`useSharedState(`row-${id}`)`) otherwise leave one empty Set per key
        // that ever mounted, for the life of the page.
        if (set.size === 0) keyListeners.delete(key);
      };
    },
    registerKey(key, initialValue) {
      // Guards on `versions`, not `state` — which is what makes hydration
      // win: it writes versions[key] during construction, strictly before any
      // hook can register the same key, so this is a no-op and the restored
      // value survives to first paint.
      if (key in versions) return;
      versions[key] = [0, clientId];
      state[key] = freezeShared(initialValue);
      snapshot = Object.freeze({ ...state }) as S;
      versionsSnapshot = Object.freeze({ ...versions });
    },
    close() {
      if (storeClosed) return;
      storeClosed = true;
      if (onSharedBus) {
        // Creation always registers the name, so the entry is present here.
        /* v8 ignore next */
        const live = (liveStores.get(name) ?? 1) - 1;
        if (live > 0) liveStores.set(name, live);
        else liveStores.delete(name);
      }
      cancelSnapshot();
      if (hasWindow) removeEventListener('pageshow', onPageShow);
      if (flushPersist) {
        flushPersist();
        if (typeof document !== 'undefined' && typeof removeEventListener === 'function') {
          removeEventListener('pagehide', flushPersist);
        }
      }
      unsubscribe();
      listeners.clear();
      keyListeners.clear();
      bus.release();
    },
  };
}
