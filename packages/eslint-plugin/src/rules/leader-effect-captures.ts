import type { Rule, Scope } from 'eslint';
import type { CallExpression, Expression, Node } from 'estree';
import { argumentAt, calleeName, docsUrl } from '../shared.js';

/**
 * Calls whose result is stable for the life of the tab, not per render.
 *
 * `useRef` by React's contract; the registry getters and the channel hooks by
 * ours — they hand back the one instance registered for that name, which is the
 * whole point of the singleton registry. Capturing any of them in an effect
 * that runs once is correct, so flagging them would train people to ignore the
 * rule.
 */
const STABLE_CALLS = new Set([
  'useRef',
  'useChannel',
  'useSend',
  'useAsk',
  'getSharedStore',
  'getLeader',
  'getChannel',
]);

/** `const [state, setState] = useState()` — the setter half is stable. */
const SETTER_FACTORIES = new Set(['useState', 'useReducer', 'useSharedState', 'useSharedReducer']);

const isStableInit = (init: Node | null | undefined): boolean =>
  init?.type === 'CallExpression' && STABLE_CALLS.has(calleeName(init) ?? '');

/**
 * Is this variable the second binding of an array destructure from a
 * setter-returning hook? React guarantees that identity; ours does too.
 */
const isSetterBinding = (variable: Scope.Variable, def: Scope.Definition): boolean => {
  if (def.type !== 'Variable') return false;
  const declarator = def.node;
  if (declarator.id.type !== 'ArrayPattern') return false;
  const init = declarator.init;
  if (init?.type !== 'CallExpression' || !SETTER_FACTORIES.has(calleeName(init) ?? ''))
    return false;
  const second = declarator.id.elements[1];
  return second?.type === 'Identifier' && second.name === variable.name;
};

/** Does `scope` sit inside `outer` — is the declaration under this callback's component? */
const isInside = (scope: Scope.Scope, outer: Scope.Scope): boolean => {
  for (let current: Scope.Scope | null = scope; current; current = current.upper) {
    if (current === outer) return true;
  }
  return false;
};

export const leaderEffectCaptures: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Warn when a leader effect closes over a value that changes between renders',
      recommended: true,
      url: docsUrl('leader-effect-captures'),
    },
    schema: [],
    messages: {
      staleCapture:
        '`{{name}}` is read inside useLeaderEffect, which re-runs only when leadership moves — ' +
        'not when `{{name}}` changes. The effect will keep using the value from the moment this ' +
        'tab took the seat. Read it through a ref, or move the value into shared state.',
    },
  },
  create(context) {
    const { sourceCode } = context;

    return {
      CallExpression(node: CallExpression) {
        if (calleeName(node) !== 'useLeaderEffect') return;

        const callback: Expression | null = argumentAt(node, 0);
        if (
          callback === null ||
          (callback.type !== 'ArrowFunctionExpression' && callback.type !== 'FunctionExpression')
        ) {
          return;
        }

        const callbackScope = sourceCode.getScope(callback as Node as Rule.Node);
        // The function the call itself sits in: the component or hook whose
        // per-render bindings are the ones that go stale. Anything declared
        // above it (module scope, imports) is stable by construction.
        const componentScope = sourceCode.getScope(node as Node as Rule.Node).variableScope;
        if (componentScope.type === 'module' || componentScope.type === 'global') return;

        const reported = new Set<string>();
        for (const reference of callbackScope.through) {
          const variable = reference.resolved;
          if (!variable || variable.defs.length !== 1) continue;
          if (reported.has(variable.name)) continue;
          if (!isInside(variable.scope, componentScope)) continue;

          const def = variable.defs[0]!;
          if (def.type === 'Variable' && isStableInit(def.node.init)) continue;
          if (isSetterBinding(variable, def)) continue;

          reported.add(variable.name);
          context.report({
            node: reference.identifier as Node as Rule.Node,
            messageId: 'staleCapture',
            data: { name: variable.name },
          });
        }
      },
    };
  },
};
