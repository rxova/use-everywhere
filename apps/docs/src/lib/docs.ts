import { getCollection } from "astro:content";
import { docsPages, sectionOf, type DocsPage, type LlmsOptions } from "@rxova/docs-kit";

/**
 * The generated TypeDoc reference is sectioned per instance (`api:core`,
 * `api:react`, `api:devtools`) rather than as one `api` group, so each can be
 * collapsed to a single link in llms.txt.
 */
const apiSectionOf = (id: string): string => {
  const [top, second] = id.split("/");
  return top === "api" && second !== undefined ? `api:${second}` : sectionOf(id);
};

/** Every page as Markdown: the one list the `.md` twins and both llms files share. */
export const pages = async () =>
  docsPages(await getCollection("docs"), {
    origin: import.meta.env.SITE,
    base: import.meta.env.BASE_URL,
    sectionOf: apiSectionOf,
  });

/** Each TypeDoc instance: its section key, the package it documents and what it covers. */
const API_GROUPS = [
  ["api:core", "@use-everywhere/core", "Every export of the framework-free core."],
  ["api:react", "use-everywhere", "Every hook and its exact prop, option and return types."],
  ["api:devtools", "use-everywhere/devtools", "The Inspector component and the bus observers."],
] as const;

/**
 * One link per TypeDoc instance, to its index page, instead of hundreds of
 * symbol pages: an index that lists every symbol has stopped being an index.
 */
const apiLinks = (optional: readonly DocsPage[]): string[] =>
  API_GROUPS.flatMap(([section, label, note]) => {
    const found = optional.filter((page) => page.section === section);
    const entry = found.find((page) => /\/(?:README|index)$/i.test(page.id)) ?? found[0];
    return entry === undefined
      ? []
      : [`- [${label}](${entry.mdUrl}): ${note} ${String(found.length)} pages.`];
  });

/**
 * The llms.txt header and sections, in the sidebar's reading order. The summary
 * is written for a model rather than lifted from `index.md`: what the library
 * does, and the design facts that change how calling code is written.
 */
export const llms: LlmsOptions = {
  project: "use-everywhere",
  summary: [
    "State, messages, presence and leader election that exist in every tab, window",
    "and worker on an origin, with a React API. `useSharedState` is `useState` whose",
    "value lives in every tab; per-key [counter, clientId] clocks give last-writer-",
    "wins with a deterministic tie-break, and a hello/snapshot handshake hydrates",
    "tabs opened later. There is no Provider and no server: a BroadcastChannel is",
    "already global to the origin, so identity is the channel name and the hooks",
    "share module-level singletons. Two transports behind one library —",
    "BroadcastChannel for same-origin, postMessage for an explicit, typed, 1:1",
    "cross-origin window channel. Shared state deliberately never crosses origins.",
    "React >= 18; ships ESM and CommonJS.",
  ],
  sections: [
    ["root", "About"],
    ["learn", "Learn"],
    ["hooks", "Hooks"],
    ["core", "Core (without React)"],
    ["guides", "Guides"],
    ["eslint", "ESLint plugin"],
    ["under-the-hood", "Under the hood"],
  ],
  optional: {
    match: (section) => section.startsWith("api:"),
    order: API_GROUPS.map(([section]) => section),
    intro: [
      "Generated TypeScript reference — exact signatures, options and return shapes.",
      "Each link is the index for one TypeDoc instance and lists every symbol in it;",
      "every symbol page is itself available as raw markdown at the same `.md` suffix.",
    ],
    links: apiLinks,
  },
};

/** Between the llms.txt header and the sections: how to install it, and the one rule that matters. */
export const preamble = [
  "## Install",
  "",
  "    npm install use-everywhere",
  "    import { useSharedState, defineChannel, usePeers } from 'use-everywhere'",
  "",
  "That package is the React surface and re-exports the whole core, so it is the",
  "only install most projects need. `@use-everywhere/core` is the same engine with",
  "no framework attached — import it directly only when you are not using React.",
  "",
  "Three more packages are published and are opt-in:",
  "`eslint-plugin-use-everywhere` catches the mistakes the types cannot (calling",
  "`defineChannel` inside a component, mismatched channel names),",
  "`@use-everywhere/test-utils` provides an in-memory transport so tests never",
  "touch a real BroadcastChannel, and `use-everywhere-codemod` rewrites a `0.x`",
  "codebase to the 1.0 names in one run.",
  "",
  "There is **no Provider**. `defineChannel` and `createStoreHooks` are called at module",
  "scope, once, and the hooks read module-level singletons keyed by channel name.",
  "Calling them inside a component is the single most common way to misuse this",
  "library, and the ESLint plugin exists to catch it.",
  "",
];
