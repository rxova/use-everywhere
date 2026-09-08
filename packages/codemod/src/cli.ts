import process from 'node:process';
import { main } from './main.js';

process.exitCode = main(process.argv.slice(2), {
  log: (line) => console.log(line),
  error: (line) => console.error(line),
  cwd: () => process.cwd(),
});
