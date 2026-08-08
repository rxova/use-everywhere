// Every docs page, also served as raw markdown at `<route>.md`.
//
// An agent asked to use this library fetches the docs and pays for the whole
// Starlight page — nav, sidebar, search index, the inline-SVG mermaid diagrams —
// to read a hook's options. This route serves the same content as the markdown it
// was written as, which is a fraction of the bytes and needs no HTML parsing.
//
// This is the first file in src/pages/. The site is otherwise entirely Starlight
// routes, and the build is `static`, so this is a build-time endpoint: every path
// is enumerated by getStaticPaths and written out as a file.
//
// `<route>.md` sits beside `<route>/index.html` rather than inside it, so nothing
// collides — `hooks/use-leader/` is a directory and `hooks/use-leader.md` is a
// sibling file.

import type { APIRoute, GetStaticPaths } from 'astro';

import { docsPages } from '../lib/docs-md.mjs';
import { renderMarkdown } from '../lib/docs-pages.mjs';

export const prerender = true;

export const getStaticPaths: GetStaticPaths = async () => {
  const pages = await docsPages({
    origin: import.meta.env.SITE,
    base: import.meta.env.BASE_URL,
  });

  // The route param carries no extension: the filename does. `[...slug].md.ts`
  // means slug `hooks/use-leader` is written to `hooks/use-leader.md`.
  return pages.map((page) => ({ params: { slug: page.id }, props: { page } }));
};

export const GET: APIRoute = ({ props }) =>
  new Response(renderMarkdown(props.page), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
