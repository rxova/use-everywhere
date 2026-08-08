// Two gates in this repo's sibling were vacuous when first written, and both
// were found only by deliberately breaking something. So every rule here has a
// case whose only job is to assert it FAILS — a gate that cannot fail reads
// exactly like one that never needed to.

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { FORBIDDEN, checkMdRoutes, isUntwinned, twinFor } from './check-md-routes.mjs';

const made = [];
afterEach(async () => {
  await Promise.all(made.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** A throwaway dist tree. `files` maps a relative path to its contents. */
async function dist(files) {
  const dir = await mkdtemp(join(tmpdir(), 'md-routes-'));
  made.push(dir);

  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), contents);
  }
  return dir;
}

const twin = (route, body) =>
  ['---', 'title: "T"', `source: https://rxova.org/${route}/`, '---', '', body, ''].join('\n');

const page = '<html><body>hi</body></html>';

describe('twinFor', () => {
  it.each([
    ['index.html', 'index.md'],
    ['hooks/use-leader/index.html', 'hooks/use-leader.md'],
  ])('%s -> %s', (html, expected) => {
    expect(twinFor(html)).toBe(expected);
  });
});

describe('isUntwinned', () => {
  it('excludes the playground app, which is not a content page', () => {
    expect(isUntwinned('playground/index.html')).toBe(true);
    expect(isUntwinned('playground/tab.html')).toBe(true);
    expect(isUntwinned('404.html')).toBe(true);
  });

  it('excludes nothing else', () => {
    expect(isUntwinned('hooks/use-leader/index.html')).toBe(false);
  });
});

describe('checkMdRoutes', () => {
  it('passes a well-formed tree', async () => {
    const dir = await dist({
      'hooks/use-leader/index.html': page,
      'hooks/use-leader.md': twin('hooks/use-leader', 'All good.'),
    });

    expect((await checkMdRoutes(dir)).failures).toEqual([]);
  });

  it('fails when a page has no twin', async () => {
    const dir = await dist({ 'hooks/use-leader/index.html': page });
    const { failures } = await checkMdRoutes(dir);

    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('has no markdown twin');
  });

  it('ignores a redirect stub, which has no content to twin', async () => {
    const dir = await dist({
      'old/index.html': '<meta http-equiv="refresh" content="0;url=/new/">',
    });

    expect((await checkMdRoutes(dir)).failures).toEqual([]);
  });

  it('ignores the playground app', async () => {
    const dir = await dist({ 'playground/index.html': page, 'playground/tab.html': page });

    expect((await checkMdRoutes(dir)).failures).toEqual([]);
  });

  it.each([
    ['an unhandled component', '<TabItem label="npm">'],
    ['a root-relative link', '[x](/hooks/y/)'],
    ['a doc-relative link', '[x](../core/y.md)'],
    ['an unresolved BASE_URL', 'src={`${import.meta.env.BASE_URL}a.png`}'],
  ])('fails on %s left in a twin', async (_, body) => {
    const dir = await dist({
      'hooks/use-leader/index.html': page,
      'hooks/use-leader.md': twin('hooks/use-leader', body),
    });

    expect((await checkMdRoutes(dir)).failures).toHaveLength(1);
  });

  it('does not flag the same markup inside a code fence', async () => {
    // hooks/inspector documents the component with a literal <Inspector /> block,
    // and half the docs are snippets containing root-relative paths. Flagging
    // those invites a "fix" that rewrites fence contents and corrupts examples.
    const dir = await dist({
      'hooks/inspector/index.html': page,
      'hooks/inspector.md': twin(
        'hooks/inspector',
        ['```tsx', '<TabItem label="npm">', '[x](/hooks/y/)', '```'].join('\n'),
      ),
    });

    expect((await checkMdRoutes(dir)).failures).toEqual([]);
  });

  it('fails on a link to a twin that does not exist', async () => {
    // The 235-dead-link case: `index.md` linked `./why.md` when the page is at
    // `learn/why`. Nothing in the build noticed, because the link is well-formed.
    const dir = await dist({
      'index.html': page,
      'index.md': twin('', '[why](https://rxova.org/why.md)'),
      'learn/why/index.html': page,
      'learn/why.md': twin('learn/why', 'Here.'),
    });
    const { failures } = await checkMdRoutes(dir);

    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('links to why.md, which is not a twin');
  });

  it('accepts a link to a twin that does exist', async () => {
    const dir = await dist({
      'index.html': page,
      'index.md': twin('', '[why](https://rxova.org/learn/why.md)'),
      'learn/why/index.html': page,
      'learn/why.md': twin('learn/why', 'Here.'),
    });

    expect((await checkMdRoutes(dir)).failures).toEqual([]);
  });

  it('resolves the site prefix under the aggregator mount', async () => {
    const dir = await dist({
      'learn/why/index.html': page,
      'learn/why.md': [
        '---',
        'title: "T"',
        'source: https://rxova.org/packages/use-everywhere/learn/why/',
        '---',
        '',
        '[self](https://rxova.org/packages/use-everywhere/learn/why.md)',
      ].join('\n'),
    });

    expect((await checkMdRoutes(dir)).failures).toEqual([]);
  });

  it.each([
    ['llms-full.txt', 801 * 1024],
    ['llms.txt', 25 * 1024],
  ])('fails when %s blows its budget', async (name, size) => {
    const dir = await dist({ [name]: 'x'.repeat(size) });
    const { failures } = await checkMdRoutes(dir);

    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('budget');
  });

  it('every FORBIDDEN rule is a real regex, not an empty match', () => {
    // A lookahead that matches the empty string makes a rule pass on everything.
    for (const [pattern] of FORBIDDEN) {
      expect(pattern.test('')).toBe(false);
    }
  });
});
