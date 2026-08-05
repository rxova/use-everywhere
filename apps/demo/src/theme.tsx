import { useEffect } from 'react';
import { defineStore, localStorageAdapter } from 'use-everywhere';

export type Theme = 'system' | 'light' | 'dark';

/** Read before paint by the inline script in index.html, so the choice does not flash. */
export const THEME_KEY = 'use-everywhere:demo-theme';

/**
 * A store of its own rather than the default one: the demos on this page are
 * about state that is deliberately ephemeral (a ticker, a payment in flight),
 * and binding their store to disk would quietly change what they demonstrate.
 * Chrome state is the exception — a theme is expected to survive a reload.
 */
const ui = defineStore<{ theme: Theme }>('ui', {
  persist: localStorageAdapter(THEME_KEY),
});

const OPTIONS: readonly Theme[] = ['system', 'light', 'dark'];
const LABEL: Record<Theme, string> = { system: 'auto', light: 'light', dark: 'dark' };

/**
 * The toggle is itself a demo: the choice is shared state, so flipping it here
 * repaints every other tab on this origin at the same time.
 *
 * `system` removes the attribute rather than resolving it, because the rxova
 * tokens already fall back to `prefers-color-scheme` when nothing is set —
 * including when the OS flips while the page is open.
 */
export function ThemeToggle() {
  const [theme, setTheme] = ui.useSharedState('theme', 'system');

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <div className="seg" role="group" aria-label="Theme">
      {OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          className="seg__btn"
          aria-pressed={theme === option}
          onClick={() => setTheme(option)}
        >
          {LABEL[option]}
        </button>
      ))}
    </div>
  );
}
