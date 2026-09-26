import type { KnipConfig } from 'knip';

/**
 * Unused files, exports and dependencies, as a gate rather than a report.
 *
 * The `export` keyword is the point: an export nothing imports still has to be
 * kept working, still shows up in completions, and still reads as part of the
 * contract. Nothing else in this repository notices one.
 *
 * Entry points are inferred from each package's manifest, so what follows is
 * only the things inference cannot know — every one of them a place where a
 * file is reached by something other than a TypeScript import.
 */
export default {
  // Advice nobody has to act on is advice that stops being read.
  treatConfigHintsAsErrors: true,
  workspaces: {
    'apps/demo': {
      // A multi-page Vite app. Each page's entry is loaded by a
      // `<script type="module" src="/src/...">` in its own HTML file — a
      // Vite-root-absolute path, which knip cannot resolve from the HTML, so
      // the entry modules are named here instead.
      entry: ['src/*-main.{ts,tsx}', 'mfe/*.ts', 'relay/*.ts'],
      // Reached through `@import` in src/styles.css. Knip reads TypeScript, so
      // a CSS import is invisible to it.
      ignoreDependencies: ['@rxova/brand'],
    },
    'apps/showcase': {
      entry: ['index.html'],
      ignoreDependencies: ['@rxova/brand'],
    },
    'apps/docs': {
      // The playground is a standalone app embedded in a docs page by
      // `<iframe>`, so nothing in the Astro tree imports it.
      entry: ['playground/tab.tsx'],
      // Reached only as a string: the Starlight preset from @rxova/astro-ui lists
      // `@rxova/brand/fonts.css` in `customCss`, which Vite resolves from this
      // site's root. Knip reads imports, so the path is invisible to it.
      ignoreDependencies: ['@rxova/brand'],
      ignore: [
        // A one-shot Docusaurus-to-Starlight migration, deliberately kept: its
        // own header says it stays "so the transforms it applied are auditable
        // next to the diff they produced". Dead by design, not by accident.
        'scripts/migrate-content.mjs',
      ],
    },
    'packages/tooling': {
      // Repo scripts, invoked by name from package.json and CI, never imported.
      entry: ['*.ts'],
    },
  },
} satisfies KnipConfig;
