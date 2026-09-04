import type { Rule, Scope } from 'eslint';
import type { Expression, Node } from 'estree';
import { argumentAt, calleeName, docsUrl } from '../shared.js';

/**
 * Every factory whose first argument is a bus name. Keys are deliberately not
 * here: a dynamic key inside one store is a documented, supported pattern
 * (`useSharedState(`row-${id}`, ...)`), while a dynamic *name* silently forks
 * the bus itself.
 */
const NAME_FIRST = new Set([
  'createStoreHooks',
  'defineChannel',
  'createNamespace',
  'createSharedStore',
  'createSharedReducer',
  'createChannel',
  'createPresence',
  'createLeader',
  'getSharedStore',
  'getLeader',
]);

/** The variable `name` resolves to from `scope`, or null when it is free. */
const resolveVariable = (scope: Scope.Scope | null, name: string): Scope.Variable | null => {
  for (let current = scope; current; current = current.upper) {
    const found = current.set.get(name);
    if (found) return found;
  }
  return null;
};

/** A string that is fixed at author time: `'cart'`, or `` `cart` ``. */
const isStaticString = (node: Expression): boolean => {
  if (node.type === 'Literal') return typeof node.value === 'string';
  return node.type === 'TemplateLiteral' && node.expressions.length === 0;
};

/**
 * A module-scope `const` bound to a static string, or an imported binding —
 * the two shapes that let several modules meet on one name without repeating
 * the string. An import counts without following it to its source: bindings are
 * immutable, and a `names.ts` of exported constants is the pattern this rule
 * wants people to reach for.
 *
 * Only `const` counts locally: a `let` can be reassigned between the two calls
 * that are supposed to land on the same bus.
 */
const isSharedNameConstant = (context: Rule.RuleContext, node: Expression): boolean => {
  if (node.type !== 'Identifier') return false;
  const variable = resolveVariable(context.sourceCode.getScope(node as Rule.Node), node.name);
  if (!variable || variable.defs.length !== 1) return false;

  const def = variable.defs[0]!;
  if (def.type === 'ImportBinding') return true;

  const scopeType = variable.scope.type;
  if (scopeType !== 'module' && scopeType !== 'global') return false;
  if (def.type !== 'Variable' || def.parent.kind !== 'const') return false;
  // `const` without an initialiser is a syntax error, so there is always one.
  return isStaticString(def.node.init as Expression);
};

export const noDynamicName: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require bus names to be statically known',
      recommended: true,
      url: docsUrl('no-dynamic-name'),
    },
    schema: [],
    messages: {
      dynamicName:
        'The name passed to `{{name}}` must be a string literal or a module-scope const string. ' +
        'A name computed at runtime forks the bus: two tabs that compute different names share ' +
        'nothing, and nothing warns — the sync just never happens.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const name = calleeName(node);
        if (!name || !NAME_FIRST.has(name)) return;

        const first = argumentAt(node, 0);
        // Absent (`defineChannel()`) means the default name, which is static.
        if (first === null) return;
        if (isStaticString(first) || isSharedNameConstant(context, first)) return;

        context.report({
          node: first as Node as Rule.Node,
          messageId: 'dynamicName',
          data: { name },
        });
      },
    };
  },
};
