import {
  createChannel,
  createLeader,
  createPresence,
  createSharedReducer,
  createSharedStore,
  type Channel,
  type ChannelOptions,
  type CommonOptions,
  type Leader,
  type LeaderOptions,
  type MessageMap,
  type Presence,
  type PresenceOptions,
  type SharedReducer,
  type SharedReducerOptions,
  type SharedStore,
  type SharedStoreOptions,
  type Transport,
} from '@use-everywhere/core';
import { MemoryHub } from '@use-everywhere/core/testing';
import { FakeLockManager } from './fake-locks.js';
import { tick } from './timing.js';
import type { Scenario, ScenarioOptions, Tab, TabOptions } from './scenario.types.js';

/** A closeable thing a tab created. Every primitive has exactly this much in common. */
type Closeable = { close(): void };

class SimulatedTab implements Tab {
  private readonly wires: Transport[] = [];
  private readonly created: Closeable[] = [];
  private state: 'open' | 'closed' | 'crashed' = 'open';

  constructor(
    readonly id: string,
    private readonly hub: MemoryHub,
    private readonly locks: FakeLockManager,
    private readonly election: 'web-locks' | 'heartbeat',
    private readonly kind: TabOptions['kind'],
  ) {}

  get gone(): boolean {
    return this.state !== 'open';
  }

  store<S extends Record<string, unknown>>(
    name: string,
    initial: S,
    options: SharedStoreOptions<S> = {},
  ): SharedStore<S> {
    return this.track(createSharedStore(name, initial, { ...this.common(), ...options }));
  }

  reducer<S, A>(
    name: string,
    reducer: (state: S, action: A) => S,
    initial: S,
    options: SharedReducerOptions = {},
  ): SharedReducer<S, A> {
    return this.track(
      createSharedReducer(name, reducer, initial, { ...this.common(), ...options }),
    );
  }

  channel<M extends MessageMap>(name: string, options: ChannelOptions<M> = {}): Channel<M> {
    return this.track(createChannel<M>(name, { ...this.common(), ...options }));
  }

  presence(name: string, options: PresenceOptions = {}): Presence {
    return this.track(createPresence(name, { ...this.common(), ...options }));
  }

  leader(name: string, options: LeaderOptions = {}): Leader {
    const election: LeaderOptions =
      this.election === 'web-locks'
        ? { strategy: 'web-locks', locks: this.locks.forOwner(this.id) }
        : { strategy: 'heartbeat' };
    return this.track(createLeader(name, { ...this.common(), ...election, ...options }));
  }

  /**
   * The difference between closing and crashing is the *order* these two lines
   * run in, which is exactly the difference in a browser: a tab that closes
   * gets its goodbye out before the wire goes, and a tab that crashes does not.
   */
  close(): void {
    if (this.gone) return;
    this.state = 'closed';
    for (const closeable of this.created) closeable.close();
    for (const wire of this.wires) wire.close();
  }

  crash(): void {
    if (this.gone) return;
    this.state = 'crashed';
    for (const wire of this.wires) wire.close();
    // The platform reclaims what a dead tab was holding. Nothing else about
    // this tab runs again — its primitives are never closed, on purpose: a
    // crashed tab does not get to tidy up, and a test that asserts peers
    // *noticed* is asserting the thing that actually matters.
    this.locks.reclaim(this.id);
  }

  /** Options every primitive in this tab shares: its own wire, its own kind. */
  private common(): CommonOptions {
    return {
      transport: () => {
        const wire = this.hub.connect();
        this.wires.push(wire);
        return wire;
      },
      // Spread-friendly: exactOptionalPropertyTypes rejects an explicit undefined.
      ...(this.kind ? { kind: this.kind } : {}),
    };
  }

  private track<T extends Closeable>(primitive: T): T {
    this.created.push(primitive);
    return primitive;
  }
}

/**
 * One simulated browser: a hub every tab shares, a Web Locks stand-in every tab
 * queues on, and tabs that can be closed *or* crashed.
 *
 * ```ts
 * const browser = createScenario();
 * const a = browser.tab();
 * const b = browser.tab();
 *
 * const cartA = a.store('cart', { items: 0 });
 * const cartB = b.store('cart', { items: 0 });
 *
 * cartA.set('items', 3);
 * await browser.settle();
 * expect(cartB.getSnapshot().items).toBe(3);
 * ```
 *
 * Nothing here touches globals: no `BroadcastChannel`, no `navigator.locks`, no
 * timers you did not ask for. Several scenarios can run in one file, in
 * parallel, without seeing each other.
 */
export function createScenario(options: ScenarioOptions = {}): Scenario {
  const hub = new MemoryHub();
  const locks = new FakeLockManager();
  const election = options.election ?? 'web-locks';
  const tabs: SimulatedTab[] = [];

  return {
    hub,
    locks,
    tabs,
    tab(tabOptions: TabOptions = {}) {
      const tab = new SimulatedTab(
        tabOptions.id ?? `tab-${tabs.length + 1}`,
        hub,
        locks,
        election,
        tabOptions.kind,
      );
      tabs.push(tab);
      return tab;
    },
    settle(ms?: number) {
      return ms === undefined ? tick() : new Promise((resolve) => setTimeout(resolve, ms));
    },
    dispose() {
      for (const tab of tabs) tab.close();
    },
  };
}
