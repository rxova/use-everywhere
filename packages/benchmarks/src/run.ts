import process from 'node:process';
import { BUDGETS } from './budgets.js';
import { checkBudgets, type Reading } from './gate.js';
import { mean } from './measure.js';
import { channelThroughput } from './suites/channel-throughput.js';
import { competitorThroughput } from './suites/competitor-throughput.js';
import { snapshotStorm } from './suites/snapshot-storm.js';
import { storeLatency, summarise } from './suites/store-latency.js';

/**
 * Run every suite, print what it measured, and — with `--check` — fail on a
 * budget.
 *
 * Runs on Node's own `BroadcastChannel`, which is the same API a browser
 * exposes and the same one the library's default transport uses. It is not a
 * browser, so treat the absolute numbers as a shape rather than a promise; the
 * ratios are what the gate reads, and those hold across runtimes.
 */
async function main(): Promise<void> {
  const check = process.argv.includes('--check');

  console.log('use-everywhere — benchmarks\n');

  const store = await storeLatency();
  const library = summarise(store.library);
  const raw = summarise(store.raw);
  console.log('store write → 5 peers applied it (ms)');
  console.log(`  library   p50 ${library.p50.toFixed(3)}   p95 ${library.p95.toFixed(3)}`);
  console.log(`  raw       p50 ${raw.p50.toFixed(3)}   p95 ${raw.p95.toFixed(3)}`);

  const channel = await channelThroughput();
  console.log('\nchannel throughput (messages/second, best of 5)');
  console.log(`  library   ${Math.round(channel.library).toLocaleString('en-US')}`);
  console.log(`  raw       ${Math.round(channel.raw).toLocaleString('en-US')}`);

  const versus = await competitorThroughput();
  console.log('\nchannel throughput vs the broadcast-channel package (messages/second, best of 5)');
  console.log(`  library             ${Math.round(versus.library).toLocaleString('en-US')}`);
  console.log(`  broadcast-channel   ${Math.round(versus.package_).toLocaleString('en-US')}`);

  const storm = await snapshotStorm();
  console.log('\nsnapshots answering one late joiner');
  for (const result of storm) {
    console.log(`  ${String(result.tabs).padStart(2)} tabs   ${result.snapshots} snapshot(s)`);
  }

  const twenty = storm.find((result) => result.tabs === 20)?.snapshots ?? Number.NaN;

  const readings: Reading[] = [
    { metric: 'store.p50-vs-raw', value: library.p50 / raw.p50 },
    { metric: 'store.p95-vs-raw', value: library.p95 / raw.p95 },
    { metric: 'channel.throughput-vs-raw', value: channel.library / channel.raw },
    { metric: 'channel.throughput-vs-package', value: versus.library / versus.package_ },
    { metric: 'storm.snapshots-at-20', value: twenty },
  ];

  console.log('\nratios (what the gate reads)');
  for (const reading of readings) {
    console.log(`  ${reading.metric.padEnd(32)} ${reading.value.toFixed(2)}`);
  }
  console.log(
    `\n  mean library store write ${mean(store.library).toFixed(3)}ms over ${store.library.length} samples`,
  );

  if (!check) return;

  const result = checkBudgets(readings, BUDGETS);
  console.log('\nbudgets');
  for (const line of result.lines) console.log(line);
  if (!result.ok) {
    console.error('\n✖ a performance budget was exceeded');
    process.exitCode = 1;
    return;
  }
  console.log('\n✔ every budget met');
}

await main();
