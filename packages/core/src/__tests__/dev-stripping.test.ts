import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

/**
 * Development warnings must not reach production bundles.
 *
 * This is a size guarantee that no size budget can express. A budget notices
 * that the bundle grew; it cannot say *why*, and the last four features each
 * paid a hundred-odd bytes for warning strings before anyone connected them.
 * Worse, the pressure ran the wrong way — every new warning was an argument for
 * writing a terser warning.
 *
 * The guarantee rests on the guard being written out literally at every call
 * site, `process.env.NODE_ENV !== 'production'`,
 * so a bundler can fold it. That is easy to forget on the next warning, and the
 * symptom is invisible — a string quietly shipping to every user. Hence a test
 * that bundles the real entry point the way a production app would and asserts
 * on what comes out.
 *
 * Diagnostic codes are what it counts. They survive minification exactly as
 * written, they are unique per call site, and a leaked one names the warning
 * that leaked — where the old scan for the `[use-everywhere]` prefix could only
 * say that *something* got through.
 */
const bundle = async (nodeEnv: string): Promise<string> => {
  const result = await build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    minify: true,
    format: 'esm',
    write: false,
    define: { 'process.env.NODE_ENV': JSON.stringify(nodeEnv) },
  });
  return result.outputFiles[0]?.text ?? '';
};

/**
 * Codes that are *not* development warnings and must survive: a thrown Error a
 * caller can catch, and the report of a throwing debug observer, which is a
 * real fault being contained in production rather than a diagnostic.
 */
const ALLOWED_IN_PRODUCTION = new Set(['UE1011', 'UE1012']);

const codes = (code: string): string[] => [...new Set(code.match(/UE\d{4}/g) ?? [])].sort();

describe('development warnings', () => {
  it('are all present in a development bundle', async () => {
    const emitted = codes(await bundle('development'));

    // The warnings are the point of the library's "every silent behaviour
    // becomes loud" rule, so the guard must not cost them in development.
    expect(emitted.length).toBeGreaterThan(5);
  });

  it('are all gone from a production bundle', async () => {
    const emitted = codes(await bundle('production'));

    // Named rather than counted: a failure here says which warning leaked.
    expect(emitted.filter((code) => !ALLOWED_IN_PRODUCTION.has(code))).toEqual([]);
  });

  it('leaves real runtime messages alone', async () => {
    const code = await bundle('production');

    // A thrown Error is not a diagnostic — stripping it would turn an
    // actionable failure into an anonymous one.
    expect(code).toContain('StorageTransport needs localStorage');
    expect(code).toContain('UE1011');
  });
});
