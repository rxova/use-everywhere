/**
 * Which mechanism a transport actually uses. Worth surfacing, because they are
 * not equivalent: `storage` is a fallback with lower fidelity than
 * `broadcast-channel`, and `none` means nothing is being shared at all.
 */
export type TransportKind = 'broadcast-channel' | 'storage' | 'memory' | 'none' | (string & {});

/**
 * Minimal message bus. Implementations: BroadcastChannelTransport (same-origin),
 * StorageTransport (fallback), NoopTransport (SSR / local-only), MemoryTransport
 * (tests). A transport never echoes a client's own posts back to it.
 */
export interface Transport {
  /** What this transport is. Optional so a custom transport need not declare one. */
  readonly kind?: TransportKind;
  post(data: unknown): void;
  subscribe(listener: (data: unknown) => void): () => void;
  close(): void;
}
