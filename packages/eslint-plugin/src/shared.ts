import type { Rule, Scope } from 'eslint';
import type { CallExpression, Expression, Node, SpreadElement, Super } from 'estree';

/** Where the rule docs live, so every message can point at a page. */
const DOCS_BASE = 'https://rxova.github.io/use-everywhere/eslint';

export const docsUrl = (rule: string): string => `${DOCS_BASE}/${rule}/`;

/**
 * The name a call invokes, for both `defineStore(...)` and
 * `checkout.defineStore(...)`.
 *
 * Namespaces (`createNamespace('checkout')`) hand back the same factories on an
 * object, so matching only bare identifiers would exempt every namespaced app —
 * the codebases these rules matter most in. The cost is that any object with a
 * `defineStore` method is treated as ours; the names are distinctive enough
 * that the trade is worth it.
 */
export const calleeName = (node: CallExpression): string | null => {
  const callee: Expression | Super = node.callee;
  if (callee.type === 'Identifier') return callee.name;
  if (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier'
  ) {
    return callee.property.name;
  }
  return null;
};

/** The argument at `index`, or null when it is absent or spread. */
export const argumentAt = (node: CallExpression, index: number): Expression | null => {
  const argument: Expression | SpreadElement | undefined = node.arguments[index];
  if (!argument || argument.type === 'SpreadElement') return null;
  return argument;
};

/**
 * Does `node` evaluate once per module, rather than once per call or render?
 *
 * `variableScope` skips block and class scopes on the way up, which is what the
 * question actually means: a call inside an `if` at module top level still runs
 * exactly once, a call inside a component runs on every render.
 */
export const atModuleScope = (context: Rule.RuleContext, node: Node): boolean => {
  const scope: Scope.Scope = context.sourceCode.getScope(node as Rule.Node).variableScope;
  return scope.type === 'module' || scope.type === 'global';
};
