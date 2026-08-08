// The llms.txt pair: https://llmstxt.org
//
// `llms.txt` is an index — headings and links, small enough that fetching it
// costs nothing and an agent can decide what else to read. `llms-full.txt` is
// every page inlined, for the case where one fetch should be the whole thing.
//
// Both are built from `docsPages()`, the same enumeration the `.md` twins use, so
// the three surfaces cannot disagree about what pages exist. Everything here is
// pure — the endpoints in src/pages are three-line adapters — because the shape
// of these documents is the part worth testing, and it needs no Astro to check.

/**
 * The library's own summary, as the blockquote llmstxt.org puts under the H1.
 *
 * Written here rather than taken from a page's frontmatter: `index.md` opens with
 * a sentence aimed at a human who has just arrived. This is the paragraph an agent
 * needs first — what the packages are, and the constraints that change how it
 * writes the calling code (no Provider, no server, same-origin by default).
 */
const SUMMARY = [
  'State, messages, presence and leader election that exist in every tab, window',
  'and worker on an origin, with a React API. `useSharedState` is `useState` whose',
  'value lives in every tab; per-key [counter, clientId] clocks give last-writer-',
  'wins with a deterministic tie-break, and a hello/snapshot handshake hydrates',
  'tabs opened later. There is no Provider and no server: a BroadcastChannel is',
  'already global to the origin, so identity is the channel name and the hooks',
  'share module-level singletons. Two transports behind one library —',
  'BroadcastChannel for same-origin, postMessage for an explicit, typed, 1:1',
  'cross-origin window channel. Shared state deliberately never crosses origins.',
  'React >= 18; ships ESM and CommonJS.',
];

/**
 * Directory name -> heading, in reading order.
 *
 * Mirrors the sidebar in astro.config.mjs, because that order is a real editorial
 * judgement about what to read first and there is no reason for an agent to get a
 * worse one than a human. A directory missing from this map still gets a heading —
 * see `groupPages` — so adding one is not a silent omission, just an unlabelled
 * section.
 */
const SECTIONS = [
  ['root', 'About'],
  ['learn', 'Learn'],
  ['hooks', 'Hooks'],
  ['core', 'Core (without React)'],
  ['guides', 'Guides'],
  ['eslint', 'ESLint plugin'],
  ['under-the-hood', 'Under the hood'],
];

/**
 * The TypeDoc instances, and the page that indexes each one.
 *
 * starlight-typedoc writes a `README` page per instance listing every symbol it
 * generated, so these three pages are a complete table of contents for the 200-odd
 * reference pages — which is exactly why `## Optional` links them instead of the
 * pages themselves. See `optionalLinks`.
 */
const API_GROUPS = [
  ['core', '@use-everywhere/core', 'Every export of the framework-free core.'],
  ['react', 'use-everywhere', 'Every hook and its exact prop, option and return types.'],
  ['devtools', 'use-everywhere/devtools', 'The Inspector component and the bus observers.'],
];

/**
 * One entry. The description is what makes the index worth fetching: a bare list
 * of forty links tells an agent nothing about which one answers its question.
 */
const link = (page, note) => `- [${page.title}](${page.mdUrl})${note ? `: ${note}` : ''}`;

/**
 * Group pages by section, in the order a reader should meet them.
 *
 * The generated reference is separated out rather than grouped: it is returned as
 * `apiPages`, keyed by group, so the index can collapse it and llms-full.txt can
 * still inline all of it.
 */
export function groupPages(pages) {
  const bySection = new Map();
  for (const page of pages) {
    if (!bySection.has(page.section)) bySection.set(page.section, []);
    bySection.get(page.section).push(page);
  }

  const groups = [];
  const take = (key, heading) => {
    const found = bySection.get(key);
    if (found?.length) groups.push({ heading, pages: found });
    bySection.delete(key);
  };

  for (const [key, heading] of SECTIONS) take(key, heading);

  // A directory the map does not know, before the generated pile. Named after
  // itself: an unlabelled section beats a missing one.
  for (const key of [...bySection.keys()].filter((k) => !k.startsWith('api:')).sort()) {
    take(key, key);
  }

  const apiPages = new Map();
  for (const key of [...bySection.keys()].sort()) {
    apiPages.set(key.slice('api:'.length), bySection.get(key));
  }

  return { groups, apiPages };
}

/**
 * The `## Optional` links: one per TypeDoc instance, not one per symbol.
 *
 * This is the whole reason `llms.txt` here is not a port of the react-inputs one.
 * There are 209 generated reference pages against 46 of prose, so listing them
 * individually would bury the index under the thing the index exists to help you
 * avoid reading. Each group's `README` page already links every symbol in it, and
 * every one of those symbols still has its own `.md` twin — the reference is one
 * hop further away, not absent.
 */
export function optionalLinks(apiPages) {
  const isIndex = (page) => /\/(?:README|index)$/i.test(page.id);

  return API_GROUPS.flatMap(([group, label, note]) => {
    const found = apiPages.get(group);
    if (!found?.length) return [];

    // The README if TypeDoc wrote one, otherwise whatever sorts first — the point
    // is to hand over one entry point per group, never to drop the group.
    const entry = found.find(isIndex) ?? found[0];
    return [`- [${label}](${entry.mdUrl}): ${note} ${found.length} pages.`];
  });
}

/**
 * The index.
 *
 * Links point at the `.md` twins rather than the HTML pages. An agent following a
 * link from here wants the content, not the chrome — and sending it to HTML when a
 * markdown twin exists wastes the fetch this file exists to save.
 */
export function llmsIndex(pages, origin) {
  const { groups, apiPages } = groupPages(pages);

  const lines = [
    '# use-everywhere',
    '',
    ...SUMMARY.map((l) => `> ${l}`),
    '',
    'Every link below is raw markdown. The human page is the same URL without the',
    '`.md` suffix.',
    '',
    // Absolute, not "the file beside this one". This document gets read detached
    // from the site as often as it gets fetched from it, and a reader that has
    // it pasted into a prompt has nothing to resolve a relative reference against.
    `Everything inlined in one fetch: ${origin}/llms-full.txt`,
    '',
    '## Install',
    '',
    '    npm install use-everywhere',
    "    import { useSharedState, defineChannel, usePeers } from 'use-everywhere'",
    '',
    'That package is the React surface and re-exports the whole core, so it is the',
    'only install most projects need. `@use-everywhere/core` is the same engine with',
    'no framework attached — import it directly only when you are not using React.',
    '',
    'Two more packages are published and are opt-in:',
    '`eslint-plugin-use-everywhere` catches the mistakes the types cannot (calling',
    '`defineChannel` inside a component, mismatched channel names), and',
    '`@use-everywhere/test-utils` provides an in-memory transport so tests never',
    'touch a real BroadcastChannel.',
    '',
    'There is **no Provider**. `defineChannel` and `defineStore` are called at module',
    'scope, once, and the hooks read module-level singletons keyed by channel name.',
    'Calling them inside a component is the single most common way to misuse this',
    'library, and the ESLint plugin exists to catch it.',
    '',
  ];

  for (const { heading, pages: group } of groups) {
    lines.push(`## ${heading}`, '');
    for (const page of group) lines.push(link(page, page.description));
    lines.push('');
  }

  const optional = optionalLinks(apiPages);
  if (optional.length > 0) {
    // llmstxt.org's designated "drop this if you are short on context" section.
    // Generated reference is exactly that: precise, bulky, and not needed until
    // an agent is writing the call.
    lines.push('## Optional', '');
    lines.push(
      'Generated TypeScript reference — exact signatures, options and return shapes.',
      'Each link is the index for one TypeDoc instance and lists every symbol in it;',
      'every symbol page is itself available as raw markdown at the same `.md` suffix.',
      '',
    );
    lines.push(...optional);
    lines.push('');
  }

  return lines.join('\n');
}

/** Everything inlined, in the same order the index lists it. */
export function llmsFull(pages) {
  const { groups, apiPages } = groupPages(pages);
  const ordered = [
    ...groups.flatMap((g) => g.pages),
    // Grouped by TypeDoc instance and in the index's order, so the reference
    // arrives as three coherent runs rather than interleaved alphabetically.
    ...API_GROUPS.flatMap(([group]) => apiPages.get(group) ?? []),
  ];

  const head = ['# use-everywhere', '', ...SUMMARY.map((l) => `> ${l}`), ''].join('\n');

  return [
    head,
    ...ordered.map((page) =>
      ['---', '', `# ${page.title}`, '', `Source: ${page.htmlUrl}`, '', page.body, ''].join('\n'),
    ),
  ].join('\n');
}
