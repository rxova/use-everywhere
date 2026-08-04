/**
 * How a value becomes text, for the two paths that cannot use structured clone.
 *
 * `BroadcastChannel` carries structured clone, so a `Date` arrives a `Date` and
 * a `Map` a `Map`. The storage-event transport and disk persistence carry
 * *text*, and JSON is a strictly poorer format: a `Date` comes back a string, a
 * `Map` comes back `{}`, an `undefined` property is simply gone. Same library,
 * same call, different answer depending on which transport happened to be
 * available — which is the kind of difference that is discovered in production.
 *
 * The seam exists so the two can be made to agree. It is deliberately *not* a
 * bundled dependency: `devalue` costs 3.4 kB brotlied and `superjson` 3.6 kB,
 * against a whole-library budget of 7.3 kB. Charging every user 47% for a
 * fidelity most of them do not need would be the wrong default. So the default
 * is JSON — free, and now loud — and anything better is one line away.
 *
 * ```ts
 * import * as devalue from 'devalue';
 *
 * localStorageAdapter('settings', {
 *   serializer: { stringify: devalue.stringify, parse: devalue.parse },
 * });
 * ```
 */
export interface Serializer {
  stringify(value: unknown): string;
  parse(text: string): unknown;
}

/**
 * Names the type when JSON would give back something else, otherwise nothing.
 *
 * Terse because these land in thrown Errors, which — unlike development
 * warnings — cannot be stripped from production bundles. What each type
 * degrades to is a table in the docs rather than seven strings in every user's
 * download.
 */
function lossyType(raw: unknown, value: unknown): string | undefined {
  // Checked on the *serialised* value, not the raw one. A property set to
  // undefined and an object whose `toJSON` returns undefined are both dropped
  // by JSON without a word, and only the first has an undefined `raw` — testing
  // both halves let the second through.
  if (value === undefined) return raw === undefined ? 'undefined' : 'undefined after toJSON';
  if (raw instanceof Date) return 'Date';
  if (raw instanceof Map) return 'Map';
  if (raw instanceof Set) return 'Set';
  if (raw instanceof RegExp) return 'RegExp';
  if (ArrayBuffer.isView(raw)) return 'TypedArray';
  const type = typeof raw;
  return type === 'function' || type === 'symbol' ? type : undefined;
}

/**
 * JSON, with silent losses turned into errors.
 *
 * Every type below survives `BroadcastChannel` and does not survive JSON, so
 * without this a value's fate depends on which transport a browser happened to
 * give you. Refusing is the same call `store.set()` already makes for a value
 * structured clone rejects: better one actionable error naming the key than two
 * replicas that quietly disagree.
 *
 * `BigInt` and circular references need no check here — `JSON.stringify` throws
 * on both already. Only the *silent* losses are worth code.
 */
export const jsonSerializer: Serializer = {
  stringify(value) {
    if (value === undefined) {
      throw new TypeError('use-everywhere: cannot serialize undefined');
    }
    return JSON.stringify(value, function replacer(this: Record<string, unknown>, key, forJson) {
      // `this[key]` is the value *before* toJSON, which is the only place a
      // Date is still a Date rather than the string it becomes.
      const type = lossyType(this[key], forJson);
      if (type) {
        throw new TypeError(
          `use-everywhere: ${key ? `"${key}" is ` : ''}${type}, which JSON cannot round-trip. ` +
            `https://rxova.org/packages/use-everywhere/guides/serialization/`,
        );
      }
      return forJson;
    });
  },
  parse: (text) => JSON.parse(text) as unknown,
};
