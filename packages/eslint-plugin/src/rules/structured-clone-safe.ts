import type { Rule, Scope } from 'eslint';
import type { Expression, Node } from 'estree';
import { argumentAt, calleeName, docsUrl } from '../shared.js';

/** Which argument of each call carries a value that has to cross the wire. */
const VALUE_ARGUMENT = new Map<string, number>([
  ['useSharedState', 1],
  ['useSharedReducer', 1],
  ['createSharedStore', 1],
  ['createSharedReducer', 2],
  ['registerKey', 1],
]);

/**
 * Constructors whose instances the structured clone algorithm carries with
 * their identity intact. Anything else built with `new` still clones — as a
 * plain object with its prototype dropped — which is the quieter bug.
 */
const CLONEABLE_CONSTRUCTORS = new Set([
  'Array',
  'ArrayBuffer',
  'Blob',
  'DataView',
  'Date',
  'Error',
  'EvalError',
  'File',
  'ImageData',
  'Map',
  'Object',
  'RangeError',
  'ReferenceError',
  'RegExp',
  'Set',
  'SyntaxError',
  'TypeError',
  'URIError',
  'BigInt64Array',
  'BigUint64Array',
  'Float32Array',
  'Float64Array',
  'Int16Array',
  'Int32Array',
  'Int8Array',
  'Uint16Array',
  'Uint32Array',
  'Uint8Array',
  'Uint8ClampedArray',
]);

/** Constructors the algorithm rejects outright, by name and with a reason. */
const UNCLONEABLE_CONSTRUCTORS = new Map([
  ['Promise', 'a Promise'],
  ['Proxy', 'a Proxy'],
  ['WeakMap', 'a WeakMap'],
  ['WeakRef', 'a WeakRef'],
  ['WeakSet', 'a WeakSet'],
]);

const isFunctionNode = (node: Node | null | undefined): boolean =>
  node?.type === 'ArrowFunctionExpression' ||
  node?.type === 'FunctionExpression' ||
  node?.type === 'FunctionDeclaration';

/** The variable `name` resolves to from `scope`, or null when it is free. */
const resolveVariable = (scope: Scope.Scope | null, name: string): Scope.Variable | null => {
  for (let current = scope; current; current = current.upper) {
    const found = current.set.get(name);
    if (found) return found;
  }
  return null;
};

/**
 * Is this identifier a function, followed one hop? `{ onSave }` reads as data
 * at the call site and is the most common way a function ends up in shared
 * state; one hop catches it without pretending to do type inference.
 */
const resolvesToFunction = (context: Rule.RuleContext, node: Expression): boolean => {
  if (node.type !== 'Identifier') return false;
  const variable = resolveVariable(context.sourceCode.getScope(node as Rule.Node), node.name);
  if (!variable || variable.defs.length !== 1) return false;
  const def = variable.defs[0]!;
  if (def.type === 'FunctionName') return true;
  return def.type === 'Variable' && isFunctionNode((def.node.init ?? null) as Node | null);
};

export const structuredCloneSafe: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require shared values to survive the structured clone algorithm',
      recommended: true,
      url: docsUrl('structured-clone-safe'),
    },
    schema: [],
    messages: {
      notCloneable:
        'Shared values cross the wire by structured clone, and {{what}} cannot be cloned. ' +
        'The write throws and is not applied — keep it out of shared state, or send an ' +
        'identifier the other tab can act on.',
      prototypeLost:
        '`new {{name}}()` survives structured clone only as a plain object: its prototype and ' +
        'methods are dropped, so the receiving tab gets data that fails `instanceof`. Share a ' +
        'plain object and rebuild the instance on the other side.',
    },
  },
  create(context) {
    const report = (node: Expression): void => {
      switch (node.type) {
        case 'ObjectExpression':
          for (const property of node.properties) {
            // Spread: whatever it holds is opaque here, so say nothing. The
            // cast is safe — patterns only appear on the left of an assignment,
            // and this literal is an argument.
            if (property.type === 'Property') report(property.value as Expression);
          }
          return;
        case 'ArrayExpression':
          for (const element of node.elements) {
            if (element && element.type !== 'SpreadElement') report(element);
          }
          return;
        case 'ArrowFunctionExpression':
        case 'FunctionExpression':
          context.report({
            node: node as Node as Rule.Node,
            messageId: 'notCloneable',
            data: { what: 'a function' },
          });
          return;
        case 'ClassExpression':
          context.report({
            node: node as Node as Rule.Node,
            messageId: 'notCloneable',
            data: { what: 'a class' },
          });
          return;
        case 'NewExpression': {
          if (node.callee.type !== 'Identifier') return;
          const name = node.callee.name;
          const unclonable = UNCLONEABLE_CONSTRUCTORS.get(name);
          if (unclonable) {
            context.report({
              node: node as Node as Rule.Node,
              messageId: 'notCloneable',
              data: { what: unclonable },
            });
            return;
          }
          if (!CLONEABLE_CONSTRUCTORS.has(name)) {
            context.report({
              node: node as Node as Rule.Node,
              messageId: 'prototypeLost',
              data: { name },
            });
          }
          return;
        }
        case 'CallExpression':
          if (calleeName(node) === 'Symbol') {
            context.report({
              node: node as Node as Rule.Node,
              messageId: 'notCloneable',
              data: { what: 'a symbol' },
            });
          }
          return;
        default:
          if (resolvesToFunction(context, node)) {
            context.report({
              node: node as Node as Rule.Node,
              messageId: 'notCloneable',
              data: { what: 'a function' },
            });
          }
      }
    };

    return {
      CallExpression(node) {
        const name = calleeName(node);
        const index = name === null ? undefined : VALUE_ARGUMENT.get(name);
        if (index === undefined) return;
        const value = argumentAt(node, index);
        if (value) report(value);
      },
    };
  },
};
