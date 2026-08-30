// Every rule here has a case whose only job is to assert it FAILS. Two gates in
// the sibling repo were vacuous when first written — a section regex whose
// lookahead matched the empty string, so every table read as empty — and both
// were found only by deliberately breaking something. A gate that cannot fail
// reads exactly like one that never needed to.

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  checkLlms,
  checkRootIndex,
  declaredExports,
  documentedExports,
  entryPoints,
} from './check-llms.js';

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

type PackageSpec = {
  readonly name: string;
  readonly files?: readonly string[];
  readonly llms?: string;
  readonly entries?: Readonly<Record<string, string>>;
  readonly private?: boolean;
};

/** A throwaway repo root containing `packages/<dir>` for each spec. */
function repo(specs: Readonly<Record<string, PackageSpec>>, rootIndex?: string): string {
  const root = mkdtempSync(join(tmpdir(), 'check-llms-'));
  made.push(root);

  for (const [dir, spec] of Object.entries(specs)) {
    const pkgDir = join(root, 'packages', dir);
    mkdirSync(join(pkgDir, 'src'), { recursive: true });
    writeFileSync(
      join(pkgDir, 'package.json'),
      JSON.stringify({
        name: spec.name,
        private: spec.private,
        files: spec.files ?? ['dist', 'llms.txt'],
      }),
    );
    if (spec.llms !== undefined) writeFileSync(join(pkgDir, 'llms.txt'), spec.llms);
    for (const [path, contents] of Object.entries(spec.entries ?? {})) {
      mkdirSync(join(pkgDir, 'src', ...path.split('/').slice(0, -1)), { recursive: true });
      writeFileSync(join(pkgDir, 'src', path), contents);
    }
  }
  if (rootIndex !== undefined) writeFileSync(join(root, 'llms.txt'), rootIndex);
  return root;
}

const wellFormed = (name: string, api = '') =>
  [
    `# ${name}`,
    '> A summary.',
    '',
    '## Install',
    '',
    `    npm i ${name}`,
    '',
    api,
    '## Docs',
    '',
    '- https://rxova.org/',
    '',
  ].join('\n');

const apiTable = (...names: string[]) =>
  [
    '## API',
    '',
    '| Export | Kind |',
    '| --- | --- |',
    ...names.map((n) => `| \`${n}\` | hook |`),
    '',
  ].join('\n');

describe('documentedExports', () => {
  it('reads the first column of a table under ## API', () => {
    expect(documentedExports(apiTable('useSharedState', 'usePeers'))).toEqual([
      'useSharedState',
      'usePeers',
    ]);
  });

  it('stops at the next heading rather than swallowing the rest of the file', () => {
    const body = [apiTable('useSharedState'), '## Gotchas', '', '| `notAnExport` | x |'].join('\n');

    expect(documentedExports(body)).toEqual(['useSharedState']);
  });

  it('returns nothing when there is no API section', () => {
    // The regression that made this rule vacuous: a lazy body with a `\s*$`
    // lookahead stops immediately and every table reads as empty.
    expect(documentedExports('## Rules\n\n| `a` | b |')).toEqual([]);
  });

  it('skips separator and prose rows rather than reporting them', () => {
    expect(
      documentedExports('## API\n\n| Export | Kind |\n| --- | --- |\n| plain text | x |'),
    ).toEqual([]);
  });
});

describe('entryPoints and declaredExports', () => {
  it('finds the main entry and each subpath', () => {
    const root = repo({
      react: { name: 'use-everywhere', entries: { 'index.ts': '', 'devtools/index.ts': '' } },
    });
    const found = entryPoints(join(root, 'packages', 'react'));

    expect(found).toHaveLength(2);
    expect(found.some((p) => p.endsWith(join('src', 'index.ts')))).toBe(true);
    expect(found.some((p) => p.endsWith(join('devtools', 'index.ts')))).toBe(true);
  });

  it.each([
    ['a re-export', "export { useFoo } from './foo.js';"],
    ['a type-only re-export', "export type { Foo } from './foo.js';"],
    ['a function declaration', 'export function useFoo() {}'],
    ['a const', 'export const useFoo = 1;'],
    ['an interface', 'export interface useFoo {}'],
  ])('collects %s', (_, source) => {
    const root = repo({ core: { name: 'c', entries: { 'index.ts': source } } });
    const declared = declaredExports(entryPoints(join(root, 'packages', 'core')));

    expect([...declared].length).toBeGreaterThan(0);
  });

  it('does not collect a non-exported declaration', () => {
    const root = repo({ core: { name: 'c', entries: { 'index.ts': 'const secret = 1;' } } });

    expect(declaredExports(entryPoints(join(root, 'packages', 'core')))).toEqual(new Set());
  });
});

describe('checkLlms', () => {
  it('passes a well-formed package', () => {
    const root = repo({
      core: {
        name: '@u/core',
        llms: wellFormed('@u/core', apiTable('createChannel')),
        entries: { 'index.ts': "export { createChannel } from './c.js';" },
      },
    });

    expect(checkLlms(root)).toEqual([]);
  });

  it('ignores a private package', () => {
    expect(checkLlms(repo({ tooling: { name: '@u/tooling', private: true } }))).toEqual([]);
  });

  it('fails when llms.txt is missing entirely', () => {
    const failures = checkLlms(repo({ core: { name: '@u/core' } }));

    expect(failures).toHaveLength(1);
    expect(failures[0]?.reason).toContain('has no llms.txt');
  });

  it('fails when llms.txt exists but is not published', () => {
    // Present but unshipped is the worst of both: maintained by hand, read by
    // nobody, and nothing else would ever say so.
    const root = repo({
      core: { name: '@u/core', files: ['dist'], llms: wellFormed('@u/core') },
    });

    expect(checkLlms(root)[0]?.reason).toContain('not in the `files` array');
  });

  it.each([
    ['a copy-pasted H1', wellFormed('@u/other'), 'must open with'],
    [
      'no summary blockquote',
      wellFormed('@u/core').replace('> A summary.', 'A summary.'),
      'blockquote',
    ],
    ['no install section', wellFormed('@u/core').replace('## Install', '## Setup'), '## Install'],
    ['no docs section', wellFormed('@u/core').replace('## Docs', '## Links'), '## Docs'],
  ])('fails on %s', (_, llms, expected) => {
    expect(checkLlms(repo({ core: { name: '@u/core', llms } }))[0]?.reason).toContain(expected);
  });

  it('fails when a documented export no longer exists', () => {
    // The rule that earns its keep: a rename leaves the table describing an API
    // that is gone, every test still passes, and the reader most likely to be
    // misled is the one least able to notice.
    const root = repo({
      core: {
        name: '@u/core',
        llms: wellFormed('@u/core', apiTable('createChannel', 'createGone')),
        entries: { 'index.ts': "export { createChannel } from './c.js';" },
      },
    });
    const failures = checkLlms(root);

    expect(failures).toHaveLength(1);
    expect(failures[0]?.reason).toContain('`createGone`');
  });

  it('accepts an export that comes from a subpath entry', () => {
    // Checking only src/index.ts would report Inspector — which really does ship
    // from use-everywhere/devtools — as drift, pushing the file to document less
    // than the package offers.
    const root = repo({
      react: {
        name: 'use-everywhere',
        llms: wellFormed('use-everywhere', apiTable('Inspector')),
        entries: { 'index.ts': '', 'devtools/index.ts': "export { Inspector } from './i.js';" },
      },
    });

    expect(checkLlms(root)).toEqual([]);
  });

  it('exempts a package documenting rules rather than symbols', () => {
    // eslint-plugin has no `## API` table on purpose; forcing one would produce
    // a heading that lies.
    const root = repo({
      plugin: { name: '@u/plugin', llms: wellFormed('@u/plugin', '## Rules\n\n| `x` | y |\n') },
    });

    expect(checkLlms(root)).toEqual([]);
  });
});

describe('checkRootIndex', () => {
  const two = { core: { name: '@u/core' }, react: { name: 'u' } };

  it('passes when the index links every published package', () => {
    const index = '- [u](packages/react/llms.txt)\n- [@u/core](packages/core/llms.txt)\n';
    expect(checkRootIndex(repo(two, index))).toEqual([]);
  });

  it('fails when a published package is missing from the index', () => {
    const failures = checkRootIndex(repo(two, '- [u](packages/react/llms.txt)\n'));

    expect(failures).toHaveLength(1);
    expect(failures[0]?.reason).toContain('packages/core/llms.txt');
    expect(failures[0]?.reason).toContain('@u/core');
  });

  it('ignores a private package, which ships no tarball to link', () => {
    const specs = { react: { name: 'u' }, tooling: { name: '@u/tooling', private: true } };

    expect(checkRootIndex(repo(specs, '- [u](packages/react/llms.txt)\n'))).toEqual([]);
  });

  // The root index is a repo-level convenience rather than part of any tarball,
  // so its absence is a choice, not drift.
  it('passes when there is no root index at all', () => {
    expect(checkRootIndex(repo(two))).toEqual([]);
  });
});
