import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url);
const filename = 'rxova-page-bundle.json';
const manifest = {
  schema: 2,
  format: 'html-page-component',
  project: 'use-everywhere',
  base: '/packages/use-everywhere/',
};
await writeFile(new URL(filename, dist), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${join('apps/docs/dist', filename)}`);
