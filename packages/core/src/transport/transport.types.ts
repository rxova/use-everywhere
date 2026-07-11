/**
 * Minimal message bus. Implementations: BroadcastChannelTransport (same-origin),
 * NoopTransport (SSR / local-only), MemoryTransport (tests). A transport never
 * echoes a client's own posts back to it.
 */
export interface Transport {
  post(data: unknown): void;
  subscribe(listener: (data: unknown) => void): () => void;
  close(): void;
}
