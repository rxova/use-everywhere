import type { LeaderOptions } from '@use-everywhere/core';

export interface UseLeaderOptions extends LeaderOptions {
  /** Which bus to elect on. Defaults to the shared default name. */
  name?: string;
}
