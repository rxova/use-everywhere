import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Every diagnostic code the library emits has an entry on the error-codes page,
 * and every entry corresponds to a code that is actually emitted.
 *
 * The link in a warning is a promise: someone hits `UE1007` at midnight, follows
 * it, and finds the paragraph that explains what to do. Nothing else in the
 * repository enforces that promise — the code is a string in one package and the
 * heading is prose in another, and neither has any idea the other exists. So
 * this test knows.
 *
 * It also catches the quieter half: a heading for a code that was deleted, which
 * reads as documentation for behaviour the library no longer has.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const docsPage = join(repoRoot, 'apps/docs/src/content/docs/errors.md');

/** Where codes may be emitted from. Test files are excluded: they invent codes. */
const SOURCE_ROOTS = ['packages/core/src', 'packages/react/src'];

const sourceFiles = (directory: string): string[] => {
  const entries = readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
};

const emittedCodes = (): Set<string> => {
  const codes = new Set<string>();
  for (const root of SOURCE_ROOTS) {
    for (const file of sourceFiles(join(repoRoot, root))) {
      // Quoted, so the codes in dev.ts's own documentation do not count as
      // call sites: only an argument someone passes is a code being emitted.
      for (const match of readFileSync(file, 'utf8').matchAll(/'(UE\d{4})'/g)) {
        codes.add(match[1]!);
      }
    }
  }
  return codes;
};

const documentedCodes = (): string[] =>
  [...readFileSync(docsPage, 'utf8').matchAll(/^## (UE\d{4})$/gm)].map((match) => match[1]!);

describe('error codes', () => {
  it('are documented, every one of them', () => {
    const documented = new Set(documentedCodes());
    const undocumented = [...emittedCodes()].filter((code) => !documented.has(code)).sort();

    expect(undocumented).toEqual([]);
  });

  it('are all still emitted — no entry outlives its warning', () => {
    const emitted = emittedCodes();
    const orphaned = documentedCodes().filter((code) => !emitted.has(code));

    expect(orphaned).toEqual([]);
  });

  it('are documented once each, in order', () => {
    const documented = documentedCodes();

    expect(new Set(documented).size).toBe(documented.length);
    expect([...documented]).toEqual([...documented].sort());
  });

  it('finds enough of them to be checking anything at all', () => {
    // A regex that stopped matching would make every assertion above vacuous.
    expect(emittedCodes().size).toBeGreaterThan(10);
  });
});
