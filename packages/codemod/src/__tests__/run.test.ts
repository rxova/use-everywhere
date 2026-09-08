import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectFiles, run } from '../run.js';

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway project with the given files, returning its root. */
function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'ue-codemod-'));
  made.push(root);
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(join(root, ...path.split('/').slice(0, -1)), { recursive: true });
    writeFileSync(join(root, path), contents);
  }
  return root;
}

const OLD = `import { useMessage } from 'use-everywhere';\nuseMessage(c, 't', h);\n`;
const NEW = `import { useOnMessage } from 'use-everywhere';\nuseOnMessage(c, 't', h);\n`;

describe('collectFiles', () => {
  it('walks a directory for every rewritable extension and skips the rest', () => {
    const root = project({
      'src/a.ts': '',
      'src/b.tsx': '',
      'src/c.js': '',
      'src/d.jsx': '',
      'src/e.mjs': '',
      'src/f.cjs': '',
      'src/g.mts': '',
      'src/h.cts': '',
      'src/i.css': '',
      'src/j.d.ts.map': '',
      'src/nested/deep/k.ts': '',
    });

    const found = collectFiles(join(root, 'src')).map((path) => path.slice(root.length + 1));

    expect(found.sort()).toEqual([
      'src/a.ts',
      'src/b.tsx',
      'src/c.js',
      'src/d.jsx',
      'src/e.mjs',
      'src/f.cjs',
      'src/g.mts',
      'src/h.cts',
      'src/nested/deep/k.ts',
    ]);
  });

  it('skips node_modules and dot-directories', () => {
    const root = project({
      'node_modules/dep/index.js': '',
      '.git/hooks/x.js': '',
      '.next/server/page.js': '',
      'ok.ts': '',
    });

    expect(collectFiles(root).map((path) => path.slice(root.length + 1))).toEqual(['ok.ts']);
  });

  it('accepts a single file, and returns nothing for one it cannot parse', () => {
    const root = project({ 'a.ts': '', 'b.md': '' });

    expect(collectFiles(join(root, 'a.ts'))).toEqual([join(root, 'a.ts')]);
    expect(collectFiles(join(root, 'b.md'))).toEqual([]);
  });
});

describe('run', () => {
  it('rewrites the files that change and reports them relative to cwd', () => {
    const root = project({ 'src/a.tsx': OLD, 'src/b.ts': `export const x = 1;\n` });

    const result = run({ paths: ['src'], cwd: root });

    expect([...result.scanned].sort()).toEqual(['src/a.tsx', 'src/b.ts']);
    expect(result.changed).toEqual(['src/a.tsx']);
    expect(readFileSync(join(root, 'src/a.tsx'), 'utf8')).toBe(NEW);
    expect(readFileSync(join(root, 'src/b.ts'), 'utf8')).toBe(`export const x = 1;\n`);
  });

  it('writes nothing in a dry run, but still says what would change', () => {
    const root = project({ 'a.tsx': OLD });
    const before = statSync(join(root, 'a.tsx')).mtimeMs;

    const result = run({ paths: ['a.tsx'], dryRun: true, cwd: root });

    expect(result.changed).toEqual(['a.tsx']);
    expect(readFileSync(join(root, 'a.tsx'), 'utf8')).toBe(OLD);
    expect(statSync(join(root, 'a.tsx')).mtimeMs).toBe(before);
  });

  it('carries transform warnings with the file they came from', () => {
    const root = project({ 'a.ts': `import { message } from 'antd';\nmessage.useMessage();\n` });

    const result = run({ paths: ['.'], cwd: root });

    expect(result.changed).toEqual([]);
    expect(result.warnings).toEqual([
      { file: 'a.ts', line: 2, message: expect.stringContaining('was left alone') },
    ]);
  });

  it('takes several paths, files and directories mixed', () => {
    const root = project({ 'one.ts': OLD, 'dir/two.ts': OLD });

    const result = run({ paths: ['one.ts', 'dir'], cwd: root });

    expect(result.changed).toEqual(['one.ts', join('dir', 'two.ts')]);
  });

  it('resolves paths against the real working directory when none is given', () => {
    const root = project({ 'a.ts': `export {};\n` });
    const previous = process.cwd();
    process.chdir(root);
    try {
      expect(run({ paths: ['a.ts'] }).scanned).toEqual(['a.ts']);
    } finally {
      process.chdir(previous);
    }
  });

  it('throws on a path that does not exist, rather than reporting success', () => {
    const root = project({});

    expect(() => run({ paths: ['missing'], cwd: root })).toThrow(/ENOENT/);
  });
});
