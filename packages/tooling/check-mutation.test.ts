import { describe, expect, it } from 'vitest';
import { FLOOR, report, scoreByFile } from './check-mutation.js';

const file = (statuses: string[]) => ({ mutants: statuses.map((status) => ({ status })) });

describe('scoreByFile', () => {
  it('scores a module by what its tests actually killed', () => {
    const scores = scoreByFile({
      files: { 'src/a.ts': file(['Killed', 'Killed', 'Killed', 'Survived']) },
    });

    expect(scores[0]?.score).toBe(75);
    expect(scores[0]).toMatchObject({ killed: 3, total: 4 });
  });

  it('counts a timeout as killed, because the mutant did not get away with it', () => {
    const scores = scoreByFile({ files: { 'src/a.ts': file(['Timeout', 'Killed']) } });

    expect(scores[0]?.score).toBe(100);
  });

  it('counts an uncovered mutant against the score', () => {
    // NoCoverage means no test even executed that line — the worst case, and
    // exactly what a per-module floor should catch.
    const scores = scoreByFile({ files: { 'src/a.ts': file(['Killed', 'NoCoverage']) } });

    expect(scores[0]?.score).toBe(50);
  });

  it('ignores mutants that were excluded or never compiled', () => {
    // `Ignored` is Stryker's word for one silenced by a `// Stryker disable`
    // comment. Counting it would punish the annotation that records a decision.
    const scores = scoreByFile({
      files: { 'src/a.ts': file(['Killed', 'Ignored', 'CompileError']) },
    });

    expect(scores[0]).toMatchObject({ killed: 1, total: 1, score: 100 });
  });

  it('calls a module with nothing to mutate perfect rather than zero', () => {
    const scores = scoreByFile({ files: { 'src/a.ts': file(['Ignored']) } });

    // 0/0 is not a failure, and dividing it would be NaN — which compares false
    // against the floor and would fail the build for a file with no mutants.
    expect(scores[0]?.score).toBe(100);
  });

  it('puts the worst module first, which is the one anybody reading this wants', () => {
    const scores = scoreByFile({
      files: {
        'src/good.ts': file(['Killed', 'Killed']),
        'src/bad.ts': file(['Killed', 'Survived']),
      },
    });

    expect(scores.map((s) => s.file)).toEqual(['src/bad.ts', 'src/good.ts']);
  });
});

describe('report', () => {
  it('passes when every module is at or above the floor', () => {
    const scores = scoreByFile({ files: { 'src/a.ts': file(Array(10).fill('Killed')) } });

    expect(report(scores).ok).toBe(true);
  });

  it('fails on a single module below the floor, however good the average', () => {
    const scores = scoreByFile({
      files: {
        // 100 killed against 1 survivor: an average that hides the small file.
        'src/big.ts': file(Array(100).fill('Killed')),
        'src/small.ts': file(['Killed', 'Survived']),
      },
    });

    // The whole reason this exists rather than leaning on Stryker's overall
    // threshold, which this set would sail past.
    expect(report(scores).ok).toBe(false);
  });

  it('treats exactly the floor as passing', () => {
    const scores = scoreByFile({
      files: { 'src/a.ts': file([...Array(9).fill('Killed'), 'Survived']) },
    });

    expect(scores[0]?.score).toBe(FLOOR);
    expect(report(scores).ok).toBe(true);
  });

  it('marks each module so a failure names itself', () => {
    const scores = scoreByFile({
      files: { 'src/bad.ts': file(['Survived']), 'src/good.ts': file(['Killed']) },
    });
    const { lines } = report(scores);

    expect(lines[0]).toContain('✖');
    expect(lines[0]).toContain('src/bad.ts');
    expect(lines[1]).toContain('✔');
  });
});
