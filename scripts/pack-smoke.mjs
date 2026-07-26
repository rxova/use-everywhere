import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

/**
 * Proves the published artifact, not the source tree.
 *
 * publint and attw (see `check:exports`) read the manifest; this actually packs
 * the tarball, installs it into a scratch project, and imports it through both
 * module systems. It is the only check that would catch a `files` entry that
 * silently dropped `dist`, or an `exports` map that resolves for a bundler but
 * not for plain Node.
 *
 * Run per package by Turbo (`pack:smoke`), with the root script serialising it
 * via --concurrency=1: concurrent `pnpm pack` invocations race on the store.
 *
 * Ported from rxova/react-inputs, adapted to this repo's dist layout — .js
 * rather than .mjs for the ESM entry, and .d.ts/.d.cts for the two type
 * entries.
 */

const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
const name = pkg.name;

const REQUIRED = [
  'package/dist/index.js',
  'package/dist/index.cjs',
  'package/dist/index.d.ts',
  'package/dist/index.d.cts',
  'package/package.json',
  'package/README.md',
  // npm only auto-includes LICENSE from the package root, so a package moved
  // into packages/* without its own copy silently ships unlicensed.
  'package/LICENSE',
];

// Shipping these would leak the whole source tree to every consumer.
const FORBIDDEN = [/^package\/src\//, /\.test\./, /^package\/e2e\//, /^package\/__tests__\//];

const workdir = mkdtempSync(join(tmpdir(), 'ue-pack-'));
let failures = 0;

const fail = (message) => {
  console.error(`  ✖ ${message}`);
  failures += 1;
};

try {
  // Workspace dependencies have to be packed alongside: `use-everywhere`
  // depends on @use-everywhere/core by `workspace:^`, which npm cannot resolve
  // from a scratch directory.
  const workspaceDirs = { '@use-everywhere/core': join(process.cwd(), '..', 'core') };
  const internalDependencies = Object.keys(pkg.dependencies ?? {}).filter(
    (dependency) => dependency in workspaceDirs,
  );
  const dependencyTarballs = {};

  const packInto = (cwd) => {
    const output = execFileSync('pnpm', ['pack', '--pack-destination', workdir], {
      cwd,
      encoding: 'utf8',
    });
    const filename = output
      .trim()
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.endsWith('.tgz'))
      .pop();
    if (!filename)
      throw new Error(`could not determine the tarball path from pack output in ${cwd}`);
    return filename.startsWith('/') ? filename : join(workdir, filename);
  };

  for (const dependency of internalDependencies) {
    console.log(`Packing workspace dependency ${dependency}…`);
    dependencyTarballs[dependency] = `file:${packInto(workspaceDirs[dependency])}`;
  }

  console.log(`Packing ${name}…`);
  const tarballPath = packInto(process.cwd());
  console.log(`  ${tarballPath}`);

  const entries = execFileSync('tar', ['-tf', tarballPath], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .map((entry) => entry.replace(/\/$/, ''));

  console.log('\nChecking tarball contents…');
  for (const required of REQUIRED) {
    if (!entries.includes(required)) fail(`missing from tarball: ${required}`);
  }
  for (const entry of entries) {
    for (const pattern of FORBIDDEN) {
      if (pattern.test(entry)) fail(`should not be published: ${entry}`);
    }
  }
  console.log(`  ${String(entries.length)} entries`);

  console.log('\nInstalling into a scratch project…');
  const consumer = join(workdir, 'consumer');
  mkdirSync(consumer, { recursive: true });
  writeFileSync(
    join(consumer, 'package.json'),
    JSON.stringify(
      {
        name: 'ue-pack-smoke',
        private: true,
        version: '1.0.0',
        type: 'module',
        dependencies: {
          [name]: `file:${tarballPath}`,
          ...dependencyTarballs,
          react: '^19.0.0',
          'react-dom': '^19.0.0',
        },
      },
      null,
      2,
    ),
  );
  execFileSync('npm', ['install', '--silent', '--no-audit', '--no-fund'], {
    cwd: consumer,
    stdio: 'inherit',
  });

  console.log('\nResolving through both module systems…');
  writeFileSync(
    join(consumer, 'esm.mjs'),
    `import * as ns from '${name}'
const names = Object.keys(ns)
if (names.length === 0) throw new Error('ESM: package exposes no exports')
console.log('  ✔ ESM import resolves (' + names.length + ' exports)')
`,
  );
  writeFileSync(
    join(consumer, 'cjs.cjs'),
    `const ns = require('${name}')
const names = Object.keys(ns)
if (names.length === 0) throw new Error('CJS: package exposes no exports')
console.log('  ✔ CJS require resolves (' + names.length + ' exports)')
`,
  );
  execFileSync('node', ['esm.mjs'], { cwd: consumer, stdio: 'inherit' });
  execFileSync('node', ['cjs.cjs'], { cwd: consumer, stdio: 'inherit' });

  // The React package declares an RSC client boundary. The directive is what
  // makes it usable from a server component tree, and losing it in the build is
  // silent until a consumer hits it. Core is not a client module, so this is
  // asserted only where it is claimed.
  if (name === 'use-everywhere') {
    const built = readFileSync(join(consumer, `node_modules/${name}/dist/index.js`), 'utf8');
    if (!built.startsWith("'use client'") && !built.startsWith('"use client"')) {
      fail('dist/index.js does not begin with the "use client" directive');
    } else {
      console.log('  ✔ "use client" directive preserved');
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  failures += 1;
} finally {
  rmSync(workdir, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\n✖ pack smoke test failed with ${String(failures)} problem(s)`);
  process.exit(1);
}
console.log('\n✔ pack smoke test passed');
