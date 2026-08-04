import type { ESLint, Linter, Rule } from 'eslint';
import { defineAtModuleScope } from './rules/define-at-module-scope.js';
import { leaderEffectCaptures } from './rules/leader-effect-captures.js';
import { noDynamicName } from './rules/no-dynamic-name.js';
import { structuredCloneSafe } from './rules/structured-clone-safe.js';

const rules: Record<string, Rule.RuleModule> = {
  'define-at-module-scope': defineAtModuleScope,
  'leader-effect-captures': leaderEffectCaptures,
  'no-dynamic-name': noDynamicName,
  'structured-clone-safe': structuredCloneSafe,
};

// No `version`: it is optional, and the alternatives are a literal that goes
// stale the first time changesets bumps the package, or importing package.json
// into the bundle. ESLint only uses it in cache keys and diagnostics.
const meta = { name: 'eslint-plugin-use-everywhere' } as const;

/**
 * The four mistakes that are silent at runtime.
 *
 * Three are errors: they produce a page that looks fine and syncs nothing, or a
 * write that throws where the value was set. `leader-effect-captures` is a
 * warning — a captured value that never actually changes is harmless, and the
 * rule cannot tell the difference, so it argues rather than blocks.
 */
const recommendedRules: Linter.RulesRecord = {
  'use-everywhere/define-at-module-scope': 'error',
  'use-everywhere/no-dynamic-name': 'error',
  'use-everywhere/structured-clone-safe': 'error',
  'use-everywhere/leader-effect-captures': 'warn',
};

const plugin: ESLint.Plugin = { meta, rules };

/**
 * Flat config, spread into `eslint.config.js`:
 *
 * ```js
 * import useEverywhere from 'eslint-plugin-use-everywhere';
 *
 * export default [useEverywhere.configs.recommended];
 * ```
 *
 * It carries no `files`, so it applies wherever the caller places it — put it
 * after a `files` block of your own if the app mixes languages.
 */
const recommended: Linter.Config = {
  name: 'use-everywhere/recommended',
  plugins: { 'use-everywhere': plugin },
  rules: recommendedRules,
};

plugin.configs = { recommended };

export { rules, recommended };
export default plugin;
