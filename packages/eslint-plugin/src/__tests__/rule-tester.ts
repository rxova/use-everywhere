import { RuleTester, type Linter } from 'eslint';
import { describe, it } from 'vitest';
import tseslint from 'typescript-eslint';

// RuleTester looks for `describe`/`it` on itself before falling back to running
// cases inline. Wiring vitest's in means a failing case reports as one named
// test rather than as an exception from whichever `run()` call got there first.
RuleTester.describe = describe;
RuleTester.it = it;

/**
 * One tester for every rule, parsing TSX.
 *
 * The rules are syntactic, but the code they run against is not: hooks live in
 * `.tsx` files with type annotations and JSX, and the default espree parser
 * rejects both. Parsing what users actually write is the point.
 */
export const ruleTester = new RuleTester({
  languageOptions: {
    // typescript-eslint types its parser against its own Linter interface; the
    // object is the same one ESLint loads at runtime.
    parser: tseslint.parser as unknown as Linter.Parser,
    parserOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
    },
  },
});
