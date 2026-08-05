import { useSyncExternalStore } from 'react';

/**
 * A hash router in twenty lines, and no dependency.
 *
 * Hash routing rather than history routing because this deploys to GitHub
 * Pages, where a path route is a 404 until you add a `404.html` that
 * impersonates the app — a workaround that breaks the browser's own error
 * reporting for genuinely missing pages. A hash never leaves the server's
 * sight, so a deep link works on the first load, which is what matters for a
 * page whose whole purpose is being opened in a second tab.
 */
const subscribe = (onChange: () => void): (() => void) => {
  addEventListener('hashchange', onChange);
  return () => removeEventListener('hashchange', onChange);
};

const read = (): string => location.hash.replace(/^#\/?/, '') || 'shared-state';

export const useRoute = (): string => useSyncExternalStore(subscribe, read, () => 'shared-state');

export const hrefFor = (slug: string): string => `#/${slug}`;

export const go = (slug: string): void => {
  location.hash = `/${slug}`;
};
