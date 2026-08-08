import { describe, expect, it } from 'vitest';

import {
  HOME,
  MAX_DESCRIPTION,
  firstSentence,
  htmlRoute,
  mdRoute,
  renderMarkdown,
  sectionOf,
} from './docs-pages.mjs';

describe('routes', () => {
  it('serves the home page at / and twins it at /index.md', () => {
    // Astro's content layer ids index.md as `index`, not ''. Assuming '' put
    // `source: /index/` — a route this site does not serve — into all 257 twins.
    expect(htmlRoute(HOME)).toBe('/');
    expect(htmlRoute('')).toBe('/');
    expect(mdRoute(HOME)).toBe('/index.md');
    expect(mdRoute('')).toBe('/index.md');
  });

  it('leaves every other route alone', () => {
    expect(htmlRoute('hooks/use-leader')).toBe('/hooks/use-leader/');
    expect(mdRoute('hooks/use-leader')).toBe('/hooks/use-leader.md');
  });
});

describe('sectionOf', () => {
  it.each([
    ['index', 'root'],
    // A file at the content root is framing material — there is no directory to
    // name a section after.
    ['errors', 'root'],
    ['hooks/use-leader', 'hooks'],
    ['under-the-hood/how-sync-works', 'under-the-hood'],
    // The generated reference is keyed by TypeDoc instance, so llms.txt can
    // collapse each one to a single link.
    ['api/core/readme', 'api:core'],
    ['api/react/functions/usesend', 'api:react'],
  ])('%s -> %s', (id, expected) => {
    expect(sectionOf(id)).toBe(expected);
  });

  it('sections a brand-new directory after itself, with no edit here', () => {
    expect(sectionOf('recipes/otp')).toBe('recipes');
  });
});

describe('firstSentence', () => {
  it('ignores code fences', () => {
    // Line-filtering on a leading ``` drops the delimiters and keeps the code,
    // describing the page to an agent as "const a = 1".
    const body = ['```ts', 'const a = 1;', '```', 'The bus carries structured clone data.'].join(
      '\n',
    );

    expect(firstSentence(body)).toBe('The bus carries structured clone data.');
  });

  it('collapses a link to its text', () => {
    // Stripping only the brackets welds the URL to the prose.
    const body = 'It matches its [two worlds](../learn/mental-model.md#idea-2) exactly.';

    expect(firstSentence(body)).toBe('It matches its two worlds exactly.');
  });

  it('strips emphasis before matching, not after', () => {
    // With the markers in, the sentence-ending period is followed by `*` rather
    // than whitespace, so nothing matches and the page loses its description.
    expect(firstSentence('**use-everywhere** is a thing that works.')).toBe(
      'use-everywhere is a thing that works.',
    );
  });

  it('truncates rather than returning nothing when no sentence fits', () => {
    const body = `${'word '.repeat(80)}ends here.`;
    const found = firstSentence(body);

    expect(found).toBeDefined();
    expect(found.length).toBeLessThanOrEqual(MAX_DESCRIPTION + 1);
    expect(found.endsWith('…')).toBe(true);
    // Cut on a word boundary, not mid-word.
    expect(found).not.toMatch(/\bwor…$/);
  });

  it('gives up on a body with nothing to summarise', () => {
    expect(firstSentence('```ts\ncode\n```')).toBeUndefined();
  });
});

describe('renderMarkdown', () => {
  const page = {
    title: 'useSharedState',
    description: 'A hook.',
    htmlUrl: 'https://rxova.org/hooks/use-shared-state/',
    body: 'Body text.',
  };

  it('synthesizes the frontmatter and H1 Starlight keeps out of the body', () => {
    expect(renderMarkdown(page)).toBe(
      [
        '---',
        'title: "useSharedState"',
        'description: "A hook."',
        'source: https://rxova.org/hooks/use-shared-state/',
        '---',
        '',
        '# useSharedState',
        '',
        'Body text.',
        '',
      ].join('\n'),
    );
  });

  it('omits description when there is none, rather than emitting an empty key', () => {
    expect(renderMarkdown({ ...page, description: undefined })).not.toContain('description:');
  });

  it('quotes a title containing a colon, which would otherwise break the YAML', () => {
    expect(renderMarkdown({ ...page, title: 'Persistence: versions' })).toContain(
      'title: "Persistence: versions"',
    );
  });
});
