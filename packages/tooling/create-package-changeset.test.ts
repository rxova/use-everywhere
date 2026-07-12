import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { run } from './create-package-changeset';

const setupRepo = async () => {
  const root = await mkdtemp(join(tmpdir(), 'create-package-changeset-'));

  await mkdir(join(root, '.changeset'), { recursive: true });
  await writeFile(join(root, '.changeset', 'config.json'), JSON.stringify({}, null, 2), 'utf8');

  await mkdir(join(root, 'packages', 'core'), { recursive: true });
  await mkdir(join(root, 'packages', 'react'), { recursive: true });
  await mkdir(join(root, 'packages', 'tooling'), { recursive: true });
  await mkdir(join(root, 'apps', 'docs'), { recursive: true });

  await writeFile(
    join(root, 'packages', 'core', 'package.json'),
    JSON.stringify({ name: '@use-everywhere/core', version: '0.1.0' }, null, 2),
    'utf8',
  );
  await writeFile(
    join(root, 'packages', 'react', 'package.json'),
    JSON.stringify({ name: 'use-everywhere', version: '0.1.0' }, null, 2),
    'utf8',
  );
  await writeFile(
    join(root, 'packages', 'tooling', 'package.json'),
    JSON.stringify({ name: '@use-everywhere/tooling', version: '0.0.0', private: true }, null, 2),
    'utf8',
  );
  await writeFile(
    join(root, 'apps', 'docs', 'package.json'),
    JSON.stringify({ name: '@use-everywhere/docs', version: '0.0.0', private: true }, null, 2),
    'utf8',
  );

  return root;
};

describe('create-package-changeset script', () => {
  it('creates one-package changeset using short package token', async () => {
    const root = await setupRepo();
    try {
      const result = run(['core', 'minor', 'Core specific update'], root);
      const created = await readFile(result.filePath, 'utf8');

      expect(result.packageName).toBe('@use-everywhere/core');
      expect(result.bump).toBe('minor');
      expect(created).toContain('"@use-everywhere/core": minor');
      expect(created).toContain('Core specific update');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('resolves the react directory token to the use-everywhere package', async () => {
    const root = await setupRepo();
    try {
      const result = run(['react', 'patch', 'React layer fix'], root);
      const created = await readFile(result.filePath, 'utf8');

      expect(result.packageName).toBe('use-everywhere');
      expect(created).toContain('"use-everywhere": patch');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('supports flags and full package names', async () => {
    const root = await setupRepo();
    try {
      const result = run(
        ['--package', 'use-everywhere', '--type', 'patch', '--summary', 'React summary'],
        root,
      );
      const created = await readFile(result.filePath, 'utf8');

      expect(result.packageName).toBe('use-everywhere');
      expect(created).toContain('"use-everywhere": patch');
      expect(created).toContain('React summary');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects private packages', async () => {
    const root = await setupRepo();
    try {
      expect(() => run(['tooling', 'patch', 'Should fail'], root)).toThrow(
        'Unknown package token "tooling".',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects invalid bumps', async () => {
    const root = await setupRepo();
    try {
      expect(() => run(['core', 'huge', 'Should fail'], root)).toThrow('Invalid bump "huge"');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
