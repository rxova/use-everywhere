import type { SharedStore } from '@use-everywhere/core';

/** Registry stores hold arbitrary keys — shape is decided by the hooks using them. */
export type AnyStore = SharedStore<Record<string, unknown>>;
