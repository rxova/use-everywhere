import { describe, expect, it } from 'vitest';

import { groupPages, llmsFull, llmsIndex, optionalLinks } from './llms.mjs';

const page = (id, section, extra = {}) => ({
  id,
  section,
  title: id,
  description: `About ${id}`,
  mdUrl: `https://rxova.org/${id}.md`,
  htmlUrl: `https://rxova.org/${id}/`,
  body: `Body of ${id}`,
  ...extra,
});

const pages = [
  page('index', 'root'),
  page('learn/why', 'learn'),
  page('hooks/use-leader', 'hooks'),
  page('guides/testing', 'guides'),
  page('api/core/readme', 'api:core'),
  page('api/core/functions/createchannel', 'api:core'),
  page('api/react/readme', 'api:react'),
  page('api/devtools/readme', 'api:devtools'),
];

describe('groupPages', () => {
  it('orders sections the way the sidebar does, not alphabetically', () => {
    const { groups } = groupPages(pages);

    expect(groups.map((g) => g.heading)).toEqual(['About', 'Learn', 'Hooks', 'Guides']);
  });

  it('keeps the generated reference out of the prose groups', () => {
    const { groups, apiPages } = groupPages(pages);

    expect(groups.flatMap((g) => g.pages.map((p) => p.id))).not.toContain('api/core/readme');
    expect([...apiPages.keys()].sort()).toEqual(['core', 'devtools', 'react']);
  });

  it('gives an unknown directory its own heading rather than dropping it', () => {
    const { groups } = groupPages([...pages, page('recipes/otp', 'recipes')]);

    expect(groups.map((g) => g.heading)).toContain('recipes');
  });
});

describe('optionalLinks', () => {
  it('collapses each TypeDoc instance to one link', () => {
    // The whole reason this file is not a port of the react-inputs one: 209
    // generated pages against 46 of prose would bury the index.
    const { apiPages } = groupPages(pages);
    const links = optionalLinks(apiPages);

    expect(links).toHaveLength(3);
    expect(links[0]).toContain('https://rxova.org/api/core/readme.md');
    expect(links[0]).toContain('2 pages.');
  });

  it('points at the README, not at whatever sorts first', () => {
    const { apiPages } = groupPages([
      page('api/core/functions/aaa', 'api:core'),
      page('api/core/readme', 'api:core'),
    ]);

    expect(optionalLinks(apiPages)[0]).toContain('/api/core/readme.md');
  });

  it('drops a group that produced no pages instead of emitting a dead link', () => {
    const { apiPages } = groupPages([page('api/core/readme', 'api:core')]);

    expect(optionalLinks(apiPages)).toHaveLength(1);
  });
});

describe('llmsIndex', () => {
  const text = llmsIndex(pages, 'https://rxova.org');

  it('opens with the H1 and a blockquote summary, as llmstxt.org specifies', () => {
    const lines = text.split('\n');

    expect(lines[0]).toBe('# use-everywhere');
    expect(lines[2].startsWith('> ')).toBe(true);
  });

  it('links the markdown twins, never the HTML pages', () => {
    // Sending an agent to HTML when a twin exists wastes the fetch this file
    // exists to save.
    const links = [...text.matchAll(/^- \[[^\]]*\]\(([^)]*)\)/gm)].map((m) => m[1]);

    expect(links.length).toBeGreaterThan(0);
    expect(links.every((href) => href.endsWith('.md'))).toBe(true);
  });

  it('describes every prose entry', () => {
    const bare = text.split('\n').filter((l) => /^- \[[^\]]+\]\([^)]+\)$/.test(l));

    expect(bare).toEqual([]);
  });

  it('states how to install and that there is no Provider', () => {
    expect(text).toContain('## Install');
    expect(text).toContain('npm install use-everywhere');
    expect(text).toContain('no Provider');
  });
});

describe('llmsFull', () => {
  const text = llmsFull(pages);

  it('inlines every page body', () => {
    for (const p of pages) expect(text).toContain(`Body of ${p.id}`);
  });

  it('runs the reference in group order, after the prose', () => {
    const at = (id) => text.indexOf(`Body of ${id}`);

    expect(at('guides/testing')).toBeLessThan(at('api/core/readme'));
    expect(at('api/core/readme')).toBeLessThan(at('api/react/readme'));
    expect(at('api/react/readme')).toBeLessThan(at('api/devtools/readme'));
  });

  it('cites the human URL so a reader can get back to the page', () => {
    expect(text).toContain('Source: https://rxova.org/hooks/use-leader/');
  });
});
