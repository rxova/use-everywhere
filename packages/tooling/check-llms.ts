/**
 * Fails if a published package's `llms.txt` is missing, malformed, or has drifted
 * from the exports it documents.
 *
 * These files ship inside the tarball, so they are what a coding agent reads out
 * of `node_modules` after an install. That makes their failure mode unusually
 * quiet: a hook renamed in `src/index.ts` leaves the table describing an API that
 * no longer exists, every test still passes, and the reader most likely to be
 * misled is the one least able to notice. Nothing else in the repo looks at these
 * files.
 *
 * So the check that earns its keep is the last one — every symbol named in an
 * `## API` table must actually be exported by the package. The rest are
 * structural, and mostly catch a file copy-pasted from a sibling package.
 *
 * ## Why exports rather than props
 *
 * The react-inputs version of this script reads `src/types.ts` and checks a
 * `## Props` table against the declared prop names. That shape does not exist
 * here: this library's surface is hooks and factories, not components with prop
 * interfaces, and `packages/react` has no `types.ts` to check against. Inventing
 * one to satisfy a checker would be the drift, not the fix. The equivalent
 * question for this repo — "does every name this file tells an agent to import
 * still exist?" — is answered from the package entry point instead.
 *
 * Offline: reads files only.
 *
 * Usage: `node --import tsx ./packages/tooling/check-llms.ts [repoRoot]`.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

export const LLMS_FILE = 'llms.txt';

export interface Failure {
  readonly package: string;
  readonly reason: string;
}

export interface PublishedPackage {
  readonly dir: string;
  readonly name: string;
  readonly files: readonly string[];
}

/** Every package that publishes a tarball. */
export function publishedPackages(repoRoot: string): PublishedPackage[] {
  const packagesDir = join(repoRoot, 'packages');

  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      dir: entry.name,
      manifestPath: join(packagesDir, entry.name, 'package.json'),
    }))
    .filter(({ manifestPath }) => existsSync(manifestPath))
    .map(({ dir, manifestPath }) => ({
      dir,
      manifest: JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>,
    }))
    .filter(({ manifest }) => manifest.private !== true)
    .map(({ dir, manifest }) => ({
      dir,
      name: String(manifest.name),
      files: Array.isArray(manifest.files) ? (manifest.files as string[]) : [],
    }));
}

/**
 * The symbol names in the first column of every markdown table under `## API`.
 *
 * Deliberately tolerant about which table: a package may document its hooks and
 * its factories in separate tables, and both are worth checking. A row whose first
 * cell is not a single backticked identifier (a `| --- |` separator, a prose row)
 * is skipped rather than reported — the goal is to catch a renamed export, not to
 * police table formatting.
 */
export function documentedExports(body: string): string[] {
  const lines = body.split('\n');
  // Sliced line-by-line rather than with one regex. The obvious
  // /^## API$([\s\S]*?)(?=^## |\s*$)/m captures NOTHING: `\s*$` in the lookahead
  // matches an empty string at the very next position, so the lazy body stops
  // immediately. The checker then passes on every file, which is worse than not
  // having it — a gate that cannot fail reads exactly like one that never needed to.
  const start = lines.findIndex((line) => line.trim() === '## API');
  if (start === -1) return [];

  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  const section = (end === -1 ? rest : rest.slice(0, end)).join('\n');

  return [...section.matchAll(/^\|\s*`([A-Za-z_$][\w$]*)`/gm)]
    .map((match) => match[1])
    .filter((name): name is string => name !== undefined);
}

/**
 * Every entry point of a package: `src/index.ts` plus one per subpath export.
 *
 * A subpath counts. `use-everywhere` ships `Inspector` from
 * `use-everywhere/devtools`, and checking only the main entry would report a
 * correctly-documented export as drift — pushing the file toward documenting
 * less than the package offers, which is the opposite of what this gate is for.
 *
 * Read off the source tree rather than the manifest's `exports` map, which
 * points at `dist` files that do not exist until a build has run. This script is
 * meant to be runnable on a clean checkout.
 */
export function entryPoints(packageDir: string): string[] {
  const srcDir = join(packageDir, 'src');
  if (!existsSync(srcDir)) return [];

  const main = join(srcDir, 'index.ts');
  const subpaths = readdirSync(srcDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(srcDir, entry.name, 'index.ts'));

  return [main, ...subpaths].filter((path) => existsSync(path));
}

/**
 * Every name a package's entry points export.
 *
 * Covers the three spellings this repo uses: `export { a, b } from './x.js'`,
 * `export { a }`, and `export function a()`. Type-only exports count — an agent
 * importing a type by name is as broken by a rename as one importing a value.
 */
export function declaredExports(entryPaths: readonly string[]): Set<string> {
  const names = new Set<string>();

  for (const entryPath of entryPaths) collectExports(entryPath, names);
  return names;
}

function collectExports(entryPath: string, names: Set<string>): void {
  if (!existsSync(entryPath)) return;

  const source = ts.createSourceFile(
    entryPath,
    readFileSync(entryPath, 'utf8'),
    ts.ScriptTarget.ES2022,
    true,
  );

  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement)) {
      const bindings = statement.exportClause;
      if (bindings && ts.isNamedExports(bindings)) {
        for (const element of bindings.elements) names.add(element.name.text);
      }
      continue;
    }

    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
    if (!modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;

    if (
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement)
    ) {
      if (statement.name) names.add(statement.name.text);
    } else if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) names.add(decl.name.text);
      }
    }
  }
}

export function checkLlms(repoRoot: string = process.cwd()): Failure[] {
  const failures: Failure[] = [];

  for (const pkg of publishedPackages(repoRoot)) {
    const add = (reason: string): void => void failures.push({ package: pkg.name, reason });
    const path = join(repoRoot, 'packages', pkg.dir, LLMS_FILE);

    if (!existsSync(path)) {
      add(`has no ${LLMS_FILE} — every published package ships one`);
      continue;
    }
    if (!pkg.files.includes(LLMS_FILE)) {
      // Present but unshipped is the worst of both: maintained by hand, read by
      // nobody, and nothing else would ever say so.
      add(`${LLMS_FILE} exists but is not in the \`files\` array, so it is not published`);
    }

    const body = readFileSync(path, 'utf8');
    const lines = body.split('\n');

    // The H1 is the package name because these files are near-identical in shape,
    // and a copy-pasted sibling is the likeliest way one goes wrong.
    if (lines[0] !== `# ${pkg.name}`) {
      add(`${LLMS_FILE} must open with "# ${pkg.name}", found ${JSON.stringify(lines[0] ?? '')}`);
    }
    // llmstxt.org: a blockquote summary directly under the title.
    if (!lines.slice(1, 4).some((line) => line.startsWith('> '))) {
      add(`${LLMS_FILE} needs a "> " summary blockquote under the title`);
    }

    // "How do I run this" and "where do I read more". `## Use` is accepted
    // alongside `## Install` for a package that is configured rather than
    // imported — demanding an Install section there would only produce a heading
    // that lies.
    if (!/^## (?:Install|Use)$/m.test(body)) {
      add(`${LLMS_FILE} is missing an "## Install" (or "## Use") section`);
    }
    if (!/^## Docs$/m.test(body)) {
      add(`${LLMS_FILE} is missing a "## Docs" section`);
    }

    // A package with an API table must keep it honest. One without a table — a
    // plugin documenting rules rather than symbols — is exempt rather than forced
    // to invent one.
    const documented = documentedExports(body);
    if (documented.length === 0) continue;

    const declared = declaredExports(entryPoints(join(repoRoot, 'packages', pkg.dir)));
    if (declared.size === 0) {
      add(`${LLMS_FILE} documents an API but no entry point exports anything to check against`);
      continue;
    }
    for (const name of documented) {
      if (!declared.has(name)) {
        add(`${LLMS_FILE} documents \`${name}\`, which no entry point exports`);
      }
    }
  }

  return failures;
}

export function formatFailures(failures: Failure[]): string {
  const details = failures.map(({ package: name, reason }) => `  ✗ ${name} ${reason}`);
  return `${String(failures.length)} llms.txt problem(s):\n${details.join('\n')}`;
}

const isEntrypoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  const [repoRoot = process.cwd()] = process.argv.slice(2);
  const failures = checkLlms(resolve(repoRoot));

  if (failures.length > 0) {
    console.error(formatFailures(failures));
    process.exit(1);
  }

  console.log('✔ Every published package ships a well-formed llms.txt');
}
