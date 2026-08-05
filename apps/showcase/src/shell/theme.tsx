import { useEffect } from 'react';
import { DEFAULT_NAME, defineStore, localStorageAdapter, useSharedState } from 'use-everywhere';

export type Theme = 'system' | 'light' | 'dark';

/** Read before paint by the inline script in index.html, so the choice does not flash. */
export const THEME_KEY = 'use-everywhere:showcase-theme';

/**
 * The theme lives in the default store, under the same `theme` key the shared
 * state page demos — so pressing a button there really does repaint every tab,
 * which is the whole argument of this app made with the app's own chrome.
 *
 * `persistKeys` keeps the rest of the default store out of localStorage: the
 * counter and the note are meant to be forgotten on reload; a theme is not.
 */
defineStore(DEFAULT_NAME, {
  persist: localStorageAdapter(THEME_KEY),
  persistKeys: ['theme'],
});

export function useTheme() {
  return useSharedState<Theme>('theme', 'system');
}

const OPTIONS: readonly Theme[] = ['system', 'light', 'dark'];
const LABEL: Record<Theme, string> = { system: 'auto', light: 'light', dark: 'dark' };

/**
 * Applies the shared choice to the document. `system` removes the attribute
 * rather than resolving it here, because the rxova tokens already fall back to
 * `prefers-color-scheme` when nothing is set — including when the OS flips
 * while the page is open.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useTheme();

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
