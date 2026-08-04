// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { webStorageAdapter } from '../persist-web-storage.js';
import { jsonSerializer, type Serializer } from '../serializer.js';
import { StorageTransport } from '../transport/storage-transport.js';
import type { Persisted } from '../persist.types.js';

/**
 * `BroadcastChannel` carries structured clone; `localStorage` carries text. The
 * same call therefore had two different answers depending on which transport a
 * browser happened to offer — a `Date` arriving as a `Date` or as a string.
 * These pin the two halves of the fix: the default refuses what it would
 * silently change, and a serializer can be swapped in to carry it properly.
 */
const memoryStorage = (): Storage => {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  } as Storage;
};

describe('the default JSON serializer', () => {
  it.each([
    ['a Date', new Date()],
    ['a Map', new Map([['a', 1]])],
    ['a Set', new Set([1])],
    ['a RegExp', /x/],
    ['a typed array', new Uint8Array([1])],
    ['a function', () => {}],
    ['a symbol', Symbol('s')],
  ])('refuses %s rather than changing it silently', (_label, value) => {
    // Every one of these survives BroadcastChannel and does not survive JSON.
    expect(() => jsonSerializer.stringify({ k: value })).toThrow(/round-trip|cannot serialize/);
  });

  it('refuses undefined, at the top level and inside an object', () => {
    expect(() => jsonSerializer.stringify(undefined)).toThrow(/undefined/);
    expect(() => jsonSerializer.stringify({ k: undefined })).toThrow(/undefined/);
  });

  it('names the key, so the error points somewhere', () => {
    expect(() => jsonSerializer.stringify({ createdAt: new Date() })).toThrow(/"createdAt"/);
  });

  it('carries everything JSON is actually good at', () => {
    const value = { a: 1, b: 'two', c: [3, null, true], d: { e: false } };

    expect(jsonSerializer.parse(jsonSerializer.stringify(value))).toEqual(value);
  });

  it('names the two ways a value can come out undefined differently', () => {
    // Same outcome — the key vanishes — but a reader debugging it needs to know
    // whether they wrote undefined or their toJSON returned it.
    expect(() => jsonSerializer.stringify({ k: undefined })).toThrow(/is undefined,/);
    expect(() => jsonSerializer.stringify({ k: { toJSON: () => undefined } })).toThrow(
      /undefined after toJSON/,
    );
  });

  it('refuses a value whose toJSON erases it', () => {
    // `raw` is an object, `value` is undefined — the two halves of the check
    // disagree, which is exactly the case a single-sided test never reaches.
    // JSON would drop the key entirely and say nothing.
    expect(() => jsonSerializer.stringify({ k: { toJSON: () => undefined } })).toThrow(
      /round-trip/,
    );
  });

  it('accepts a value whose toJSON returns something real', () => {
    const text = jsonSerializer.stringify({ k: { toJSON: () => 'fine' } });

    expect(jsonSerializer.parse(text)).toEqual({ k: 'fine' });
  });

  it('carries an explicit null, which is a value rather than an absence', () => {
    expect(jsonSerializer.parse(jsonSerializer.stringify({ k: null }))).toEqual({ k: null });
  });

  it('leaves the errors JSON already throws alone', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    // Cycles and BigInt already fail loudly, so checking for them again would
    // be code that buys nothing.
    expect(() => jsonSerializer.stringify(circular)).toThrow();
    expect(() => jsonSerializer.stringify({ big: 1n })).toThrow();
  });
});

describe('a swapped-in serializer', () => {
  // Stand-in for devalue/superjson: enough fidelity to prove the seam, without
  // this package taking a 3.4 kB dependency to test one interface.
  const dateAware: Serializer = {
    // `this[k]`, not `v`: JSON.stringify calls Date.prototype.toJSON *before*
    // the replacer sees the value, so `v` is already a string by then. The same
    // trap the library's own default has to step around.
    stringify: (value) =>
      JSON.stringify(value, function (this: Record<string, unknown>, k, v: unknown) {
        const raw = this[k];
        return raw instanceof Date ? { __d: raw.toISOString() } : v;
      }),
    parse: (text) =>
      JSON.parse(text, (_k, v: unknown) => {
        const tagged = v as { __d?: string } | null;
        return tagged && typeof tagged === 'object' && typeof tagged.__d === 'string'
          ? new Date(tagged.__d)
          : v;
      }) as unknown,
  };

  it('round-trips a Date through persistence', () => {
    const storage = memoryStorage();
    const adapter = webStorageAdapter(storage, 'ser-persist', { serializer: dateAware });
    const when = new Date('2020-01-02T03:04:05.000Z');

    adapter.write({ v: 1, state: { when }, versions: { when: [1, 'a'] } } as Persisted);
    // The adapter interface allows an async read; these built-ins are sync.
    const back = adapter.read() as Persisted | undefined;

    expect(back?.state.when).toBeInstanceOf(Date);
    expect((back?.state.when as Date).toISOString()).toBe(when.toISOString());
  });

  it('is used by the storage transport too, so wire and disk can agree', () => {
    const storage = memoryStorage();
    const transport = new StorageTransport('ser-wire', storage, dateAware);

    // The default would have thrown on this; the point of the seam is that the
    // two text paths can be given the same fidelity.
    expect(() => transport.post({ when: new Date() })).not.toThrow();

    transport.close();
  });
});

describe('persistence with the default serializer', () => {
  it('reports a lossy write through onError instead of throwing', () => {
    const storage = memoryStorage();
    const onError = vi.fn();
    const adapter = webStorageAdapter(storage, 'ser-lossy', { onError });

    adapter.write({
      v: 1,
      state: { when: new Date() },
      versions: { when: [1, 'a'] },
    } as Persisted);

    // Persistence is best-effort and must never break the page, so this is a
    // report rather than a throw — but it is no longer silent.
    expect(onError).toHaveBeenCalledTimes(1);
    expect(String(onError.mock.calls[0]?.[0])).toMatch(/round-trip/);
    expect(adapter.read()).toBeUndefined();
  });
});
