import { describe, expect, it } from 'vitest';
import { createSharedStore } from '../shared-store.js';
import { MemoryHub } from '../transport/memory-hub.js';
import { tick } from './helpers/tick.js';

describe('createSharedStore accept option', () => {
  it('filters incoming patches by meta but still sends its own writes', async () => {
    const hub = new MemoryHub();
    const picky = createSharedStore(
      'test',
      { count: 0 },
      {
        transport: () => hub.connect(),
        accept: (meta) => meta.kind !== 'worker',
      },
    );
    const worker = createSharedStore(
      'test',
      { count: 0 },
      { transport: () => hub.connect(), kind: 'worker' },
    );
    const tab = createSharedStore(
      'test',
      { count: 0 },
      { transport: () => hub.connect(), kind: 'tab' },
    );
    await tick();

    worker.set('count', 50);
    await tick();
    expect(picky.getSnapshot().count).toBe(0); // worker write rejected
    expect(tab.getSnapshot().count).toBe(50); // unfiltered peer applied it

    // Rejecting a write leaves the rejecter's version clock behind, so a single
    // write would tie with the worker's counter (random clientId tie-break).
    // Two writes give a deterministically higher counter.
    picky.set('count', 1);
    picky.set('count', 1);
    await tick();
    expect(worker.getSnapshot().count).toBe(1); // outbound writes still broadcast

    picky.close();
    worker.close();
    tab.close();
  });

  it('filters snapshot merges too (late joiner ignores filtered peers)', async () => {
    const hub = new MemoryHub();
    const worker = createSharedStore(
      'test',
      { count: 0 },
      { transport: () => hub.connect(), kind: 'worker' },
    );
    worker.set('count', 7);
    await tick();

    const picky = createSharedStore(
      'test',
      { count: 0 },
      {
        transport: () => hub.connect(),
        accept: (meta) => meta.kind !== 'worker',
      },
    );
    await tick(); // worker's snapshot reply arrives and is rejected

    expect(picky.getSnapshot().count).toBe(0);
    picky.close();
    worker.close();
  });
});
