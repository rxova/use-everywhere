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
 * Messages that are *not* development warnings and must survive: a thrown
 * Error a caller can catch, and the report of a throwing debug observer, which
 * is a real fault being contained in production rather than a diagnostic.
 */
const ALLOWED_IN_PRODUCTION = ['StorageTransport needs localStorage', 'a bus observer for'];

const warnings = (code: string): string[] =>
  (code.match(/\[use-everywhere\][^`'"]{0,80}/g) ?? []).filter(
    (message) => !ALLOWED_IN_PRODUCTION.some((allowed) => message.includes(allowed)),
  );

describe('development warnings', () => {
  it('are all present in a development bundle', async () => {
    const code = await bundle('development');

    // The warnings are the point of the library's "every silent behaviour
    // becomes loud" rule, so the guard must not cost them in development.
    expect(warnings(code).length).toBeGreaterThan(5);
  });

  it('are all gone from a production bundle', async () => {
    const code = await bundle('production');

    // Named rather than counted: a failure here should say which warning leaked.
    expect(warnings(code)).toEqual([]);
  });

  it('leaves real runtime messages alone', async () => {
    const code = await bundle('production');

    // A thrown Error is not a diagnostic — stripping it would turn an
    // actionable failure into an anonymous one.
    expect(code).toContain('StorageTransport needs localStorage');
  });
});
