// Pure helpers describing the shape of the docs as a set of pages.
//
// Kept apart from docs-md.mjs, which imports `astro:content` and so only exists
// inside an Astro build. Everything here is ordinary JavaScript over plain
// objects, which is what makes it testable — and these are exactly the rules
// worth testing, because a wrong route or a mis-sectioned page produces output
// that still looks complete.

import { splitFenced } from './mdx-to-markdown.mjs';

/**
 * The home page's id.
 *
 * Astro's content layer names `index.md` after its path, so the id is the literal
 * string `index` — NOT the empty string, which is what Starlight's older
 * collection API produced. The distinction is invisible until you use it: with
 * `''` assumed, `htmlRoute` falls through to `/index/`, which is not a route this
 * site serves, and every one of the 257 twins would cite a dead URL as its source.
 */
export const HOME = 'index';

/** The `.md` route for a page id. The home page is `/index.md`, not `/.md`. */
export const mdRoute = (id) => `/${id || HOME}.md`;

/** The canonical HTML route, which the `.md` twin cites as its source. */
export const htmlRoute = (id) => (!id || id === HOME ? '/' : `/${id}/`);

/**
 * Which part of the site a page belongs to, as llms.txt sections.
 *
 * Derived from the content tree rather than declared anywhere: these docs are
 * organised by top-level directory, and that directory IS the sidebar group, so
 * a new `guides/` page sections itself and a whole new directory gets its own
 * heading with no edit here. `src/lib/llms.mjs` maps the directory name to a
 * human label; a directory it does not know still appears, under its own name.
 *
 * `api:<group>` is deliberately distinct from `<group>`: the generated TypeDoc
 * reference belongs under llms.txt's "Optional" heading — the spec's designated
 * place for "drop this if you are short on context" — not interleaved with prose.
 * The group is the TypeDoc instance (`core`, `react`, `devtools`), which is the
 * unit the reference is actually navigated in.
 */
export function sectionOf(id) {
  if (id === HOME) return 'root';

  const [top, second] = id.split('/');
  if (top === 'api') return second ? `api:${second}` : 'root';

  // A file at the content root (`errors.md`) is framing material, not a section
  // of its own — there is no directory to name it after.
  return id.includes('/') ? top : 'root';
}

/**
 * First sentence of the body, for a page whose frontmatter carries no description.
 *
 * A bare link list in llms.txt is much less useful than one where every entry says
 * what it is, and most prose pages here do set a description — this is the
 * fallback so the ones that do not still contribute something. The generated
 * TypeDoc pages never do, and they are the majority.
 */
export const MAX_DESCRIPTION = 200;

export function firstSentence(body) {
  // Fence CONTENTS, not just the fence markers. Filtering line-by-line on a
  // leading ``` drops the delimiters and leaves the code between them, so a page
  // that opens with an example would be described to an agent as "const a = 1".
  const prose = splitFenced(body)
    .unfenced.split('\n')
    // Fences, headings, JSX, and directive syntax: none of them summarise a page.
    .filter(
      (line) => line.trim() && !/^\s*(?:[`~]{3}|#|<|import\b|export\b|:::|\||-{3,})/.test(line),
    )
    .join(' ')
    // Links collapse to their text. Stripping only the brackets would leave the
    // URL welded to the words around it — `security-model` opens on a link, and
    // its description read "…matching its two worlds(../learn/mental-model.md…)".
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Emphasis comes off BEFORE the match, not after. A page opening
    // "**use-everywhere** is `useState`, except…" would otherwise have its
    // sentence-ending period followed by `*` rather than whitespace, so the first
    // sentence would not match and the page would silently lose its description.
    .replace(/[*_`[\]]/g, '')
    .trim();

  const match = new RegExp(`^(.{20,${MAX_DESCRIPTION}}?[.!?])\\s`).exec(`${prose} `);
  if (match) return match[1];

  // No sentence ends inside the budget. Truncating beats returning nothing: two
  // of these pages open on a sentence longer than 200 characters, and both were
  // silently arriving in llms.txt as a bare link with no idea what they cover —
  // which is the one thing the index exists to prevent.
  if (prose.length <= 20) return undefined;
  const clipped = prose.slice(0, MAX_DESCRIPTION);
  const lastSpace = clipped.lastIndexOf(' ');
  return `${(lastSpace > 20 ? clipped.slice(0, lastSpace) : clipped).replace(/[,;:—-]$/, '')}…`;
}

/**
 * The document served at a `.md` route.
 *
 * The synthesized frontmatter is not decoration. Starlight pages carry their title
 * in frontmatter and no H1 in the body, so passing the body through would arrive
 * untitled; `source` is what lets a reader cite the human page it came from.
 */
export function renderMarkdown(page) {
  return [
    '---',
    `title: ${JSON.stringify(page.title)}`,
    ...(page.description ? [`description: ${JSON.stringify(page.description)}`] : []),
    `source: ${page.htmlUrl}`,
    '---',
    '',
    `# ${page.title}`,
    '',
    page.body,
    '',
  ].join('\n');
}
