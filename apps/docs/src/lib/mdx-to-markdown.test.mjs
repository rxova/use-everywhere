import { describe, expect, it } from 'vitest';

import {
  absolutizeUrls,
  mapUnfenced,
  mdxToMarkdown,
  normalizePath,
  resolveRelativeLinks,
  splitFenced,
  stripImports,
  unwrapStarlightComponents,
} from './mdx-to-markdown.mjs';

const site = { origin: 'https://rxova.org', base: '/' };

describe('mapUnfenced', () => {
  it('leaves fence contents alone', () => {
    const source = ['before', '```ts', "import x from '@astrojs/starlight'", '```', 'after'].join(
      '\n',
    );

    expect(mapUnfenced(source, (chunk) => chunk.toUpperCase())).toBe(
      ['BEFORE', '```ts', "import x from '@astrojs/starlight'", '```', 'AFTER'].join('\n'),
    );
  });

  it('does not end a fence on a line that merely looks like one', () => {
    // A shorter run, or one carrying an info string, is content.
    const source = ['````md', '```ts', 'code', '```', '````', 'after'].join('\n');
    const seen = [];
    mapUnfenced(source, (chunk) => (seen.push(chunk), chunk));

    expect(seen).toEqual(['after']);
  });
});

describe('splitFenced', () => {
  it('reports openers separately from unfenced prose', () => {
    const { unfenced, openers } = splitFenced(['a', '```tsx', 'x', '```', 'b'].join('\n'));

    expect(unfenced).toBe('a\nb');
    expect(openers).toEqual(['```tsx']);
  });
});

describe('stripImports', () => {
  it('removes an import line', () => {
    expect(stripImports("import { Tabs } from '@astrojs/starlight/components'\ntext")).toBe('text');
  });

  it('leaves a word that merely starts with import', () => {
    expect(stripImports('importantly, no.')).toBe('importantly, no.');
  });
});

describe('unwrapStarlightComponents', () => {
  it('keeps a TabItem label as a heading rather than dropping it', () => {
    const source = ['<Tabs>', '<TabItem label="npm">', 'npm i x', '</TabItem>', '</Tabs>'].join(
      '\n',
    );

    expect(unwrapStarlightComponents(source)).toContain('#### npm');
  });
});

describe('normalizePath', () => {
  it.each([
    ['/guides/../core/x.md', '/core/x.md'],
    ['/guides/./x.md', '/guides/x.md'],
    ['/a/b/../../c.md', '/c.md'],
    // Clamped at the root rather than escaping — a link that needed this is
    // wrong at the source, and check-md-routes reports it as dangling.
    ['/../../x.md', '/x.md'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizePath(input)).toBe(expected);
  });
});

describe('resolveRelativeLinks', () => {
  const from = (fromRoute, text) => resolveRelativeLinks(text, { ...site, fromRoute });

  it('resolves a doc-relative link against the page being written', () => {
    expect(from('/guides/testing.md', '[t](../core/transports.md)')).toBe(
      '[t](https://rxova.org/core/transports.md)',
    );
  });

  it('keeps the fragment', () => {
    expect(from('/under-the-hood/how.md', '[l](./limitations.md#last-writer-wins)')).toBe(
      '[l](https://rxova.org/under-the-hood/limitations.md#last-writer-wins)',
    );
  });

  it('lowercases, because Astro lowercases the id it builds the route from', () => {
    // TypeDoc really does write README.md, and Starlight really does serve it at
    // /api/core/readme/. Without this the link resolves to a twin that does not exist.
    expect(from('/core/overview.md', '[api](../api/core/README.md)')).toBe(
      '[api](https://rxova.org/api/core/readme.md)',
    );
  });

  it('applies the aggregator base', () => {
    expect(
      resolveRelativeLinks('[t](../core/x.md)', {
        origin: 'https://rxova.org',
        base: '/packages/use-everywhere/',
        fromRoute: '/guides/testing.md',
      }),
    ).toBe('[t](https://rxova.org/packages/use-everywhere/core/x.md)');
  });

  it('leaves a non-markdown relative link alone', () => {
    expect(from('/a/b.md', '[img](./diagram.svg)')).toBe('[img](./diagram.svg)');
  });
});

describe('absolutizeUrls', () => {
  it('rewrites root-relative markdown links', () => {
    expect(absolutizeUrls('[x](/hooks/use-leader/)', site)).toBe(
      '[x](https://rxova.org/hooks/use-leader/)',
    );
  });

  it('leaves protocol-relative and absolute URLs alone', () => {
    expect(absolutizeUrls('[x](//cdn.example/a) [y](https://e.com/b)', site)).toBe(
      '[x](//cdn.example/a) [y](https://e.com/b)',
    );
  });
});

describe('mdxToMarkdown', () => {
  it('never rewrites a link inside a code fence', () => {
    // The failure this whole module is shaped around: the docs are mostly
    // snippets, and rewriting inside one corrupts the example silently.
    const source = ['```md', '[x](../core/transports.md)', '```'].join('\n');

    expect(mdxToMarkdown(source, { ...site, fromRoute: '/guides/testing.md' })).toBe(source);
  });

  it('resolves relative links before root-relative ones', () => {
    const out = mdxToMarkdown('[a](../core/x.md) [b](/hooks/y/)', {
      ...site,
      fromRoute: '/guides/testing.md',
    });

    expect(out).toBe('[a](https://rxova.org/core/x.md) [b](https://rxova.org/hooks/y/)');
  });

  it('collapses the blank lines unwrapping leaves behind', () => {
    expect(mdxToMarkdown('a\n\n\n\nb', { ...site, fromRoute: '/index.md' })).toBe('a\n\nb');
  });
});
