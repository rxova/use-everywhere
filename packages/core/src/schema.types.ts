/**
 * The [Standard Schema](https://standardschema.dev) v1 interface, inlined.
 *
 * Inlined rather than depended on, which is the whole point of the spec: it is
 * a shape, not a package. Zod, Valibot and ArkType all expose `~standard`, so
 * accepting this type means accepting any of them — and any hand-written
 * validator — without this library taking a dependency on, or a position about,
 * which one you use.
 *
 * Only the parts that are read here are declared. The full spec has more.
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown,
    ) => StandardSchemaResult<Output> | Promise<StandardSchemaResult<Output>>;
    readonly types?: { readonly input: Input; readonly output: Output } | undefined;
  };
}

export type StandardSchemaResult<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<{ readonly message: string }> };

/** Why a payload was refused, for {@link OnInvalid}. */
export interface InvalidPayload {
  /** The bus this happened on. */
  readonly name: string;
  /** Message type for a channel, key for a store. */
  readonly key: string;
  /** `'in'` — a peer sent it; `'out'` — this client tried to send it. */
  readonly direction: 'in' | 'out';
  /** The value as it arrived. Not validated, so genuinely `unknown`. */
  readonly payload: unknown;
  /** One line per issue the schema reported, or a single line explaining a schema that could not be used. */
  readonly issues: readonly string[];
}

/**
 * Called when a payload fails its schema, instead of the default development
 * warning. Report it, count it, sample it — but it does not change the outcome:
 * an inbound payload is dropped and an outbound one throws either way.
 */
export type OnInvalid = (info: InvalidPayload) => void;

/**
 * Per-key validators. A key with no entry is not validated, so adopting this
 * one message or one store key at a time is the expected way to use it.
 */
export type SchemaMap<M> = {
  readonly [K in keyof M & string]?: StandardSchemaV1<unknown, M[K]>;
};

export interface SchemaOptions<M> {
  /**
   * Validate payloads against a [Standard Schema](https://standardschema.dev)
   * before trusting them — any Zod, Valibot or ArkType schema, or anything else
   * exposing `~standard`.
   *
   * Without this, an inbound payload is **cast, not checked**: a peer running
   * last week's deploy sends whatever that build thought the shape was, and the
   * receiving code reads it as whatever this build's types say. That is the one
   * place in this library where a type is a hope rather than a guarantee, and
   * a rolling deploy is what turns it into a bug.
   *
   * Validation runs in both directions. Inbound, a failure drops the payload —
   * the same choice the envelope makes for a wire it cannot read. Outbound, it
   * **throws**, because a value your own code just produced and cannot describe
   * is a bug in this tab, and finding it here beats finding it in someone
   * else's.
   */
  readonly schema?: SchemaMap<M>;
  /** Observe validation failures instead of the default development warning. */
  readonly onInvalid?: OnInvalid;
}
