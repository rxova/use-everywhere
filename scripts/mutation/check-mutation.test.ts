import { describe, expect, it } from "vitest";
import { FLOOR, report, runnerFailure, scoreByFile } from "./check-mutation.js";

const file = (statuses: string[]) => ({ mutants: statuses.map((status) => ({ status })) });

/** A module whose mutants carry the static/non-static split the runner check reads. */
const mixed = (
  nonStatic: string[],
  staticStatuses: string[] = [],
): { mutants: { status: string; static: boolean }[] } => ({
  mutants: [
    ...nonStatic.map((status) => ({ status, static: false })),
    ...staticStatuses.map((status) => ({ status, static: true })),
  ],
});

describe("scoreByFile", () => {
  it("scores a module by what its tests actually killed", () => {
    const scores = scoreByFile({
      files: { "src/a.ts": file(["Killed", "Killed", "Killed", "Survived"]) },
    });

    expect(scores[0]?.score).toBe(75);
    expect(scores[0]).toMatchObject({ killed: 3, total: 4 });
  });

  it("counts a timeout as killed, because the mutant did not get away with it", () => {
    const scores = scoreByFile({ files: { "src/a.ts": file(["Timeout", "Killed"]) } });

    expect(scores[0]?.score).toBe(100);
  });

  it("counts an uncovered mutant against the score", () => {
    // NoCoverage means no test even executed that line — the worst case, and
    // exactly what a per-module floor should catch.
    const scores = scoreByFile({ files: { "src/a.ts": file(["Killed", "NoCoverage"]) } });

    expect(scores[0]?.score).toBe(50);
  });

  it("ignores mutants that were excluded or never compiled", () => {
    // `Ignored` is Stryker's word for one silenced by a `// Stryker disable`
    // comment. Counting it would punish the annotation that records a decision.
    const scores = scoreByFile({
      files: { "src/a.ts": file(["Killed", "Ignored", "CompileError"]) },
    });

    expect(scores[0]).toMatchObject({ killed: 1, total: 1, score: 100 });
  });

  it("calls a module with nothing to mutate perfect rather than zero", () => {
    const scores = scoreByFile({ files: { "src/a.ts": file(["Ignored"]) } });

    // 0/0 is not a failure, and dividing it would be NaN — which compares false
    // against the floor and would fail the build for a file with no mutants.
    expect(scores[0]?.score).toBe(100);
  });

  it("puts the worst module first, which is the one anybody reading this wants", () => {
    const scores = scoreByFile({
      files: {
        "src/good.ts": file(["Killed", "Killed"]),
        "src/bad.ts": file(["Killed", "Survived"]),
      },
    });

    expect(scores.map((s) => s.file)).toEqual(["src/bad.ts", "src/good.ts"]);
  });
});

describe("report", () => {
  it("passes when every module is at or above the floor", () => {
    const scores = scoreByFile({ files: { "src/a.ts": file(Array(10).fill("Killed")) } });

    expect(report(scores).ok).toBe(true);
  });

  it("fails on a single module below the floor, however good the average", () => {
    const scores = scoreByFile({
      files: {
        // 100 killed against 1 survivor: an average that hides the small file.
        "src/big.ts": file(Array(100).fill("Killed")),
        "src/small.ts": file(["Killed", "Survived"]),
      },
    });

    // The whole reason this exists rather than leaning on Stryker's overall
    // threshold, which this set would sail past.
    expect(report(scores).ok).toBe(false);
  });

  it("treats exactly the floor as passing", () => {
    const scores = scoreByFile({
      files: { "src/a.ts": file([...Array(9).fill("Killed"), "Survived"]) },
    });

    expect(scores[0]?.score).toBe(FLOOR);
    expect(report(scores).ok).toBe(true);
  });

  it("marks each module so a failure names itself", () => {
    const scores = scoreByFile({
      files: { "src/bad.ts": file(["Survived"]), "src/good.ts": file(["Killed"]) },
    });
    const { lines } = report(scores);

    expect(lines[0]).toContain("✖");
    expect(lines[0]).toContain("src/bad.ts");
    expect(lines[1]).toContain("✔");
  });
});

describe("runnerFailure", () => {
  it("names the shape of the failure that cost this repo eight scheduled runs", () => {
    // The real 2026-10-30 report: 1383 non-static survivors, and the only ten
    // kills were static mutants, which re-run the whole suite and so never go
    // through the per-test filter at all.
    const broken = runnerFailure({
      files: {
        "src/a.ts": mixed(Array(1383).fill("Survived"), Array(10).fill("Killed")),
      },
    });

    expect(broken).toContain("1383 non-static mutants");
    expect(broken).toContain("10 static mutants were");
  });

  it("stays quiet when any non-static mutant died, however bad the score", () => {
    // A genuinely weak module must still be reported as a score, not mistaken
    // for a broken runner — that is the whole point of the floor check.
    const scores = mixed([...Array(99).fill("Survived"), "Killed"]);

    expect(runnerFailure({ files: { "src/a.ts": scores } })).toBeUndefined();
    expect(report(scoreByFile({ files: { "src/a.ts": scores } })).ok).toBe(false);
  });

  it("stays quiet on too few non-static mutants to mean anything", () => {
    // Below the sample size a module may legitimately kill none of them.
    expect(
      runnerFailure({ files: { "src/a.ts": mixed(Array(19).fill("Survived"), ["Killed"]) } }),
    ).toBeUndefined();
  });

  it("ignores mutants that never ran when judging the sample", () => {
    // `Ignored` and `CompileError` are outside the score, so they cannot make up
    // the sample that decides whether the runner is at fault.
    expect(
      runnerFailure({
        files: {
          "src/a.ts": mixed(
            [...Array(30).fill("Ignored"), ...Array(5).fill("Survived")],
            ["Killed"],
          ),
        },
      }),
    ).toBeUndefined();
  });

  it("counts a timeout as a non-static mutant dying", () => {
    // A timeout killed the mutant, so the filter plainly ran something.
    expect(
      runnerFailure({
        files: { "src/a.ts": mixed([...Array(30).fill("Survived"), "Timeout"], ["Killed"]) },
      }),
    ).toBeUndefined();
  });

  it("keeps the count readable when a single static mutant carried the whole score", () => {
    // A `mutate` list of one small module can produce exactly one static kill,
    // and the message is the only thing a reader of the CI log gets.
    expect(
      runnerFailure({ files: { "src/a.ts": mixed(Array(30).fill("Survived"), ["Killed"]) } }),
    ).toContain("1 static mutant was");
  });

  it("reads a report with no static mutants at all as a broken runner too", () => {
    // Nothing here says the kills must be static — only that no non-static
    // mutant died, which is the thing that cannot happen to a working suite.
    expect(runnerFailure({ files: { "src/a.ts": mixed(Array(40).fill("Survived")) } })).toContain(
      "40 non-static mutants",
    );
  });
});
