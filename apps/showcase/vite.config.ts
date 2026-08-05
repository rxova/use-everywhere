import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The showcase ships to GitHub Pages under a repository path, so every asset
 * reference has to be relative to a base that is not `/`. `SHOWCASE_BASE` keeps
 * that a deploy-time decision rather than a source one: the workflow sets
 * `/use-everywhere/`, a custom domain later sets nothing and gets `/`.
 */
export default defineConfig({
  plugins: [react()],
  base: process.env.SHOWCASE_BASE ?? '/',
});
