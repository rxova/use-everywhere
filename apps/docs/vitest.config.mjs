import { defineConfig } from 'vitest/config';

/**
 * Covers the agent-facing surfaces — the markdown normalizer, the page helpers,
 * the llms.txt builders and the build-time gate. The rest of the site is verified
 * by the build itself (`astro check`, starlight-links-validator and
 * check-md-routes all run there), so there is still no component suite to
 * configure here.
 *
 * These modules are worth unit tests specifically because their failure mode is
 * silent: a mis-sectioned page or a link left unresolved still produces output
 * that reads as a complete document.
 */
export default defineConfig({
  test: {
    include: ['scripts/**/*.test.mjs', 'src/**/*.test.mjs'],
    environment: 'node',
  },
});
