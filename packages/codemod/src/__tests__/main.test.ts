import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { main, USAGE, type Io } from '../main.js';

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fakeIo(cwd = process.cwd()) {
  const out: string[] = [];
  const err: string[] = [];
  const io: Io = { log: (line) => out.push(line), error: (line) => err.push(line), cwd: () => cwd };
  return { io, out, err };
}

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'ue-codemod-cli-'));
  made.push(root);
  for (const [name, contents] of Object.entries(files)) writeFileSync(join(root, name), contents);
  return root;
}

const OLD = `import { useMessage } from 'use-everywhere';\nuseMessage(c, 't', h);\n`;

describe('main', () => {
  it('prints usage and fails when called with nothing', () => {
    const { io, out } = fakeIo();

    expect(main([], io)).toBe(2);
    expect(out).toEqual([USAGE]);
  });

  it.each(['--help', '-h'])('prints usage and succeeds on %s', (flag) => {
    const { io, out } = fakeIo();

    expect(main([flag], io)).toBe(0);
    expect(out).toEqual([USAGE]);
  });

  it('rejects a transform it does not have', () => {
    const { io, err } = fakeIo();

    expect(main(['rename-2.0', 'src'], io)).toBe(2);
    expect(err[0]).toMatch(/Unknown transform "rename-2.0"/);
  });

  it('rejects an option it does not have', () => {
    const { io, err } = fakeIo();

    expect(main(['rename-1.0', 'src', '--verbose'], io)).toBe(2);
    expect(err[0]).toMatch(/Unknown option --verbose/);
  });

  it('needs at least one path', () => {
    const { io, err } = fakeIo();

    expect(main(['rename-1.0', '--dry-run'], io)).toBe(2);
    expect(err[0]).toMatch(/at least one file or directory/);
  });

  it('rewrites, lists each changed file and counts', () => {
    const root = project({ 'a.tsx': OLD, 'b.ts': `export {};\n` });
    const { io, out } = fakeIo(root);

    expect(main(['rename-1.0', '.'], io)).toBe(0);
    expect(readFileSync(join(root, 'a.tsx'), 'utf8')).toContain('useOnMessage');
    expect(out).toEqual(['  ✔ a.tsx', '1 of 2 file(s) changed']);
  });

  it('marks a dry run as such and writes nothing', () => {
    const root = project({ 'a.tsx': OLD });
    const { io, out } = fakeIo(root);

    expect(main(['rename-1.0', '--dry-run', 'a.tsx'], io)).toBe(0);
    expect(readFileSync(join(root, 'a.tsx'), 'utf8')).toBe(OLD);
    expect(out).toEqual(['  ~ a.tsx', '1 of 1 file(s) would change (dry run — nothing written)']);
  });

  it('prints what it left for the reader to check', () => {
    const root = project({ 'a.ts': `import { message } from 'antd';\nmessage.useMessage();\n` });
    const { io, out } = fakeIo(root);

    expect(main(['rename-1.0', 'a.ts'], io)).toBe(0);
    expect(out[0]).toBe('0 of 1 file(s) changed');
    expect(out[2]).toBe('Left for you to check:');
    expect(out[3]).toMatch(/^ {2}a\.ts:2 /);
  });

  it('reports a path it cannot read and fails', () => {
    const root = project({});
    const { io, err } = fakeIo(root);

    expect(main(['rename-1.0', 'missing'], io)).toBe(1);
    expect(err[0]).toMatch(/ENOENT/);
  });

  it('reports a non-Error throw as text', () => {
    const { io, err } = fakeIo();
    // A cwd that is not a string makes path resolution throw a TypeError —
    // still an Error. The branch for a bare thrown value is reached through a
    // getter that throws a string.
    const throwing: Io = {
      ...io,
      cwd: () => {
        throw 'boom';
      },
    };

    expect(main(['rename-1.0', 'x'], throwing)).toBe(1);
    expect(err).toEqual(['boom']);
  });
});
