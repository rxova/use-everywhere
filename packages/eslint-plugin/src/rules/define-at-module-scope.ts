import type { Rule } from 'eslint';
import { atModuleScope, calleeName, docsUrl } from '../shared.js';

/**
 * The definers register options for a name and hand back bound hooks. Calling
 * one inside a component re-registers on every render: the registry keeps the
 * first registration, so a second `createStoreHooks('settings', { persist })` after
 * the store exists warns or throws instead of quietly applying, and the hooks
 * object is a fresh identity each render for anything that memoizes on it.
 *
 * They construct nothing at module scope — that is the whole point of the
 * register-now-build-later design — so there is never a reason to defer them.
 */
const DEFINERS = new Set(['createStoreHooks', 'defineChannel', 'createNamespace']);

export const defineAtModuleScope: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require createStoreHooks, defineChannel and createNamespace at module scope',
      recommended: true,
      url: docsUrl('define-at-module-scope'),
    },
    schema: [],
    messages: {
      notModuleScope:
        '`{{name}}` must be called at module scope. Inside a function it re-registers on every ' +
        'call, and only the first registration takes effect — move it to the top level of the module.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const name = calleeName(node);
        if (!name || !DEFINERS.has(name)) return;
        if (atModuleScope(context, node)) return;
        context.report({ node, messageId: 'notModuleScope', data: { name } });
      },
    };
  },
};
