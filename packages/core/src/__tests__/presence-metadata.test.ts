import { describe, expect, it } from 'vitest';
import { createPresence } from '../presence.js';
import { MemoryHub } from '../transport/memory-hub.js';
import { tick } from './helpers/tick.js';

/**
 * Presence answered "who is here" and nothing about *who* they are. Metadata is
 * the seam for a display name, a tab title, a cursor — the things an avatar
 * strip or a collaborative UI needs and had no way to carry.
 */
let n = 0;
const uniqueName = () => `pm-${++n}`;

describe('presence metadata', () => {
  it('reaches peers on the first announcement', async () => {
    const hub = new MemoryHub();
    const name = uniqueName();
    const watcher = createPresence(name, { transport: () => hub.connect() });
    const named = createPresence(name, {
      transport: () => hub.connect(),
      metadata: { display: 'Ada' },
    });
    await tick();

    expect(watcher.getPeers()).toHaveLength(1);
    expect(watcher.getPeers()[0]?.metadata).toEqual({ display: 'Ada' });

    watcher.close();
    named.close();
  });

  it('updates peers when it changes', async () => {
    const hub = new MemoryHub();
    const name = uniqueName();
    const watcher = createPresence(name, { transport: () => hub.connect() });
    const named = createPresence(name, {
      transport: () => hub.connect(),
      metadata: { display: 'Ada' },
    });
    await tick();

    named.setMetadata({ display: 'Ada Lovelace' });
    await tick();

    expect(watcher.getPeers()[0]?.metadata).toEqual({ display: 'Ada Lovelace' });

    watcher.close();
    named.close();
  });

  it('says nothing when set to the value it already had', async () => {
    const hub = new MemoryHub();
    const name = uniqueName();
    const watcher = createPresence(name, { transport: () => hub.connect() });
    const named = createPresence(name, {
      transport: () => hub.connect(),
      metadata: { display: 'Ada' },
    });
    await tick();
    let notifications = 0;
    watcher.subscribe(() => notifications++);

    // A fresh object with the same contents, which is what a hook passes on
    // every render. Comparing by reference would announce and re-render forever.
    named.setMetadata({ display: 'Ada' });
    await tick();

    expect(notifications).toBe(0);

    watcher.close();
    named.close();
  });

  it('survives the heartbeats that carry none', async () => {
    const hub = new MemoryHub();
    const name = uniqueName();
    const watcher = createPresence(name, { transport: () => hub.connect() });
    const named = createPresence(name, {
      transport: () => hub.connect(),
      metadata: { display: 'Ada' },
      heartbeatMs: 10,
    });
    await tick();

    // Pings deliberately carry no metadata, so the receiver has to keep what it
    // already knows instead of blanking the peer on every heartbeat.
    await new Promise((r) => setTimeout(r, 40));

    expect(watcher.getPeers()[0]?.metadata).toEqual({ display: 'Ada' });

    watcher.close();
    named.close();
  });

  it('leaves a peer that published none without any', async () => {
    const hub = new MemoryHub();
    const name = uniqueName();
    const watcher = createPresence(name, { transport: () => hub.connect() });
    const anonymous = createPresence(name, { transport: () => hub.connect() });
    await tick();

    expect(watcher.getPeers()[0]?.metadata).toBeUndefined();

    watcher.close();
    anonymous.close();
  });
});

describe('includeSelf', () => {
  it('puts this client in its own roster, from the first read', () => {
    const hub = new MemoryHub();
    const presence = createPresence(uniqueName(), {
      transport: () => hub.connect(),
      includeSelf: true,
      metadata: { display: 'me' },
    });

    // Present before anyone else turns up: an avatar list that starts empty and
    // fills in later is a flicker, not a feature.
    const roster = presence.getPeers();
    expect(roster).toHaveLength(1);
    expect(roster[0]?.id).toBe(presence.clientId);
    expect(roster[0]?.metadata).toEqual({ display: 'me' });

    presence.close();
  });

  it('is off by default, because the question is who else is here', async () => {
    const hub = new MemoryHub();
    const presence = createPresence(uniqueName(), { transport: () => hub.connect() });
    await tick();

    expect(presence.getPeers()).toHaveLength(0);

    presence.close();
  });

  it('carries this client own metadata changes into its own entry', async () => {
    const hub = new MemoryHub();
    const presence = createPresence(uniqueName(), {
      transport: () => hub.connect(),
      includeSelf: true,
    });

    presence.setMetadata({ display: 'renamed' });

    expect(presence.getPeers()[0]?.metadata).toEqual({ display: 'renamed' });

    presence.close();
  });

  it('lists self alongside real peers', async () => {
    const hub = new MemoryHub();
    const name = uniqueName();
    const mine = createPresence(name, { transport: () => hub.connect(), includeSelf: true });
    const other = createPresence(name, { transport: () => hub.connect() });
    await tick();

    expect(mine.getPeers()).toHaveLength(2);
    expect(mine.getPeers().map((p) => p.id)).toContain(mine.clientId);

    mine.close();
    other.close();
  });
});
