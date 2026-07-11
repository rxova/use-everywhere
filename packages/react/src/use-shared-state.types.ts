/**
 * How far a shared value travels:
 * - 'everywhere' — every tab, window, and worker on this origin (default)
 * - 'tabs'       — tabs and windows only; writes coming from workers are ignored
 * - 'tab'        — this tab only (state is still shared between components)
 */
export type ShareScope = 'everywhere' | 'tabs' | 'tab';

export interface UseSharedStateOptions {
  /** Store name; keys live in a namespace per store. Default 'use-everywhere'. */
  store?: string;
  /** How much to share. Default 'everywhere'. */
  scope?: ShareScope;
}
