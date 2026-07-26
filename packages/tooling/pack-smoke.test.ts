import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * pack-smoke is the check that proves the *published artifact*, so testing it by
 * importing functions would miss the point — what matters is that it fails when
 * a tarball is wrong. Each case builds a throwaway package with a deliberate
 * defect, runs the real script against it, and asserts it complains.
 *
 * `pnpm pack` is genuinely invoked, so these are slower than unit tests. That is
 * the cost of covering the one gate whose whole job is to be pessimistic.
 */

const here = dirname(fileURLToPath(import.meta.url));
const scriptPath = resolve(here, './pack-smoke.ts');
const tsxLoaderPath = resolve(here, '../../node_modules/tsx/dist/loader.mjs');

const sanitizedEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
) as Record<string, string>;

const roots: string[] = [];

const runScript = (cwd: string) => {
  try {
    const stdout = execFileSync(process.execPath, ['--import', tsxLoaderPath, scriptPath], {
      cwd,
      env: sanitizedEnv,
      stdio: 'pipe',
      encoding: 'utf8',
    });
    return { code: 0, output: stdout };
  } catch (error) {
    const err = error as { status?: number; stdout?: Buffer; stderr?: Buffer };
    const output = [err.stdout?.toString(), err.stderr?.toString()]
      .filter((value): value is string => Boolean(value))
      .join('\n');
    return { code: err.status ?? 1, output };
  }
};

/**
 * A minimal package that satisfies the contract: dual ESM/CJS entries, both
 * declaration flavours, a README and a LICENSE. Individual tests then remove or
 * corrupt exactly one piece.
 */
const makePackage = async (options: {
  readonly omit?: readonly string[];
  readonly includeSrc?: boolean;
  readonly clientDirective?: boolean;
}) => {
  const root = await mkdtemp(join(tmpdir(), 'pack-smoke-'));
  roots.push(root);
  const omit = new Set(options.omit ?? []);

  const files: Record<string, string> = {
    'README.md': '# fixture\n',
    LICENSE: 'MIT\n',
    'dist/index.js': `${options.clientDirective === false ? '' : "'use client'\n"}export const value = 1\n`,
    'dist/index.cjs': "'use strict'\nexports.value = 1\n",
    'dist/index.d.ts': 'export declare const value: number\n',
    'dist/index.d.cts': 'export declare const value: number\n',
  };
  if (options.includeSrc) files['src/index.ts'] = 'export const value = 1\n';

  for (const [rel, body] of Object.entries(files)) {
    if (omit.has(rel)) continue;
    await mkdir(join(root, dirname(rel)), { recursive: true });
    await writeFile(join(root, rel), body, 'utf8');
  }

  await writeFile(
    join(root, 'package.json'),
    JSON.stringify(
      {
        name: 'pack-smoke-fixture',
        version: '0.0.0',
        type: 'module',
        files: options.includeSrc ? ['dist', 'src'] : ['dist'],
        exports: {
          '.': {
            import: { types: './dist/index.d.ts', default: './dist/index.js' },
            require: { types: './dist/index.d.cts', default: './dist/index.cjs' },
          },
        },
      },
      null,
      2,
    ),
    'utf8',
  );

  return root;
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('pack-smoke', () => {
  it('passes a well-formed package', async () => {
    const root = await makePackage({});
    const result = runScript(root);

    expect(result.output).toContain('pack smoke test passed');
    expect(result.code).toBe(0);
  }, 120_000);

  it('fails when dist is missing from the tarball', async () => {
    const root = await makePackage({ omit: ['dist/index.js'] });
    const result = runScript(root);

    expect(result.code).toBe(1);
    expect(result.output).toContain('missing from tarball');
  }, 120_000);

  it('fails when LICENSE is absent from the package directory', async () => {
    // npm only auto-includes LICENSE from the package root, so a package moved
    // into packages/* without its own copy silently ships unlicensed.
    const root = await makePackage({ omit: ['LICENSE'] });
    const result = runScript(root);

    expect(result.code).toBe(1);
    expect(result.output).toContain('LICENSE');
  }, 120_000);

  it('fails when a declaration flavour is missing', async () => {
    const root = await makePackage({ omit: ['dist/index.d.cts'] });
    const result = runScript(root);

    expect(result.code).toBe(1);
    expect(result.output).toContain('index.d.cts');
  }, 120_000);

  it('rejects a tarball that ships src', async () => {
    const root = await makePackage({ includeSrc: true });
    const result = runScript(root);

    expect(result.code).toBe(1);
    expect(result.output).toContain('should not be published');
  }, 120_000);
});
