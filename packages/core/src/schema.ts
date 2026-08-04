import { devWarn } from './dev.js';
import type { InvalidPayload, OnInvalid, SchemaMap, StandardSchemaV1 } from './schema.types.js';

/**
 * Run one payload through one schema, synchronously.
 *
 * **Synchronously is not a simplification, it is the constraint.** Delivery on
 * this bus is synchronous — a sibling copy of the library on the same page sees
 * a write in the same task, and that is a documented guarantee, not an
 * implementation detail. A validator that returns a promise cannot gate a
 * synchronous delivery without either buffering every message behind a
 * microtask or letting unvalidated values through while it thinks.
 *
 * So an async schema is refused, loudly, the same way an unreadable payload is.
 * Standard Schema permits async validators; this seam does not, and says so
 * with an error naming the vendor rather than by quietly awaiting nothing.
 * Every synchronous validator — which is every Zod, Valibot and ArkType schema
 * that does not use an async refinement — is unaffected.
 */
export function validate(
  schema: StandardSchemaV1<unknown, unknown>,
  payload: unknown,
): { ok: true; value: unknown } | { ok: false; issues: string[] } {
  const props = schema['~standard'];
  const result = props.validate(payload);
  if (typeof (result as Promise<unknown>).then === 'function') {
    return { ok: false, issues: [`the "${props.vendor}" schema validates asynchronously`] };
  }
  const sync = result as Exclude<typeof result, Promise<unknown>>;
  if (sync.issues) return { ok: false, issues: sync.issues.map((issue) => issue.message) };
  return { ok: true, value: sync.value };
}

/** @internal Everything a channel or store needs to police one direction of one key. */
export interface Gate {
  /** `true` when an inbound payload may be used. Reports the failure first, then the caller drops it. */
  accepts(key: string, payload: unknown): boolean;
  /** Throws when an outbound payload fails, having reported it. */
  assert(key: string, payload: unknown): void;
}

export function createGate(
  name: string,
  schemas: SchemaMap<Record<string, unknown>> | undefined,
  onInvalid: OnInvalid | undefined,
): Gate | undefined {
  // No schemas means no gate at all, so the whole path — and its strings —
  // costs nothing at runtime for the callers who never opt in.
  if (!schemas) return undefined;

  /** The issues, or `undefined` when the payload is fine. */
  const check = (key: string, payload: unknown, direction: 'in' | 'out') => {
    const schema = schemas[key];
    if (!schema) return undefined;
    const result = validate(schema, payload);
    if (result.ok) return undefined;
    const info: InvalidPayload = { name, key, direction, payload, issues: result.issues };
    if (onInvalid) onInvalid(info);
    // Terse, with the explanation behind the link — a warning earns its length
    // in a console, not in prose. The NODE_ENV guard around the call is what
    // keeps this string out of production bundles; see env.d.ts.
    else if (process.env.NODE_ENV !== 'production') {
      devWarn(
        'UE1003',
        `${name}/${key}: ${direction}bound payload rejected by its schema — ` +
          `${result.issues.join('; ')}. https://rxova.org/guides/validating-payloads/`,
      );
    }
    return result.issues;
  };

  return {
    accepts: (key, payload) => !check(key, payload, 'in'),
    assert(key, payload) {
      const issues = check(key, payload, 'out');
      // Thrown here rather than at each call site so there is one message
      // rather than two near-identical ones — and so no caller can forget that
      // an outbound refusal is meant to be loud.
      if (issues) {
        throw new TypeError(
          `use-everywhere: ${name}/${key} — the value does not match its schema, so nothing was sent or applied. ${issues.join('; ')}`,
        );
      }
    },
  };
}
