import ts from 'typescript';

/** The package whose exports were renamed. Nothing in `@use-everywhere/core` changed. */
export const PACKAGE = 'use-everywhere';

/**
 * The named exports renamed at 1.0, old spelling → new. The table from RFC 0001,
 * and the whole of what the `rename-1.0` transform knows about.
 *
 * Every entry is an identifier rename with no signature change, which is what
 * makes the transform safe to run unattended: it never has to reason about an
 * argument list.
 */
export const RENAMES: Readonly<Record<string, string>> = Object.freeze({
  useMessage: 'useOnMessage',
  useOpenedWindow: 'useWindowResult',
  defineStore: 'createStoreHooks',
  useSharedStore: 'useSharedSelector',
  UseMessageOptions: 'UseOnMessageOptions',
  DefineStoreOptions: 'CreateStoreHooksOptions',
  UseOpenedWindow: 'UseWindowResult',
});

/**
 * Members renamed on the objects the factories hand back, keyed by what built
 * the receiver. These are property names, so they are only rewritten where the
 * receiver is provably one of ours — see `receiverKind`.
 */
const MEMBER_RENAMES: Readonly<Record<ReceiverKind, Readonly<Record<string, string>>>> = {
  store: { get: 'store' },
  channel: { useMessage: 'useOnMessage' },
  namespace: { defineStore: 'createStoreHooks', useSharedStore: 'useSharedSelector' },
};

type ReceiverKind = 'store' | 'channel' | 'namespace';

/** Which factory call produces which kind of receiver. Both spellings of the store factory count. */
const FACTORIES: Readonly<Record<string, ReceiverKind>> = {
  defineStore: 'store',
  createStoreHooks: 'store',
  defineChannel: 'channel',
  createNamespace: 'namespace',
};

/**
 * Member names distinctive enough to rewrite on a receiver the transform cannot
 * type. `defineStore` and `useSharedStore` exist on a `ReactNamespace` and, in
 * practice, nowhere else a React codebase reaches through a dot — so a
 * namespace object imported from another file still gets its calls renamed.
 * `useMessage` and `get` are deliberately absent: `message.useMessage()` is
 * antd, `.get()` is every Map, and a rename there would be a silent break.
 */
const DISTINCTIVE_MEMBERS: Readonly<Record<string, string>> = MEMBER_RENAMES.namespace;

export interface TransformWarning {
  /** 1-based line of the call the transform left alone. */
  readonly line: number;
  readonly message: string;
}

export interface TransformResult {
  readonly source: string;
  readonly changed: boolean;
  /** Places that may need a hand: a `.useMessage(` call on a receiver the transform could not attribute. */
  readonly warnings: readonly TransformWarning[];
}

interface Edit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

const EXTENSION_KINDS: Readonly<Record<string, ts.ScriptKind>> = {
  '.ts': ts.ScriptKind.TS,
  '.mts': ts.ScriptKind.TS,
  '.cts': ts.ScriptKind.TS,
  '.tsx': ts.ScriptKind.TSX,
  '.js': ts.ScriptKind.JS,
  '.mjs': ts.ScriptKind.JS,
  '.cjs': ts.ScriptKind.JS,
  '.jsx': ts.ScriptKind.JSX,
};

/** File extensions the transform parses. Anything else is skipped rather than guessed at. */
export const EXTENSIONS: readonly string[] = Object.keys(EXTENSION_KINDS);

const scriptKind = (filename: string): ts.ScriptKind => {
  const dot = filename.lastIndexOf('.');
  const extension = dot === -1 ? '' : filename.slice(dot);
  return EXTENSION_KINDS[extension] ?? ts.ScriptKind.TSX;
};

const isRequireOf = (node: ts.Expression | undefined, module: string): boolean =>
  node !== undefined &&
  ts.isCallExpression(node) &&
  ts.isIdentifier(node.expression) &&
  node.expression.text === 'require' &&
  node.arguments.length === 1 &&
  ts.isStringLiteral(node.arguments[0]!) &&
  node.arguments[0].text === module;

/**
 * Rewrite one file from the 0.x names to the 1.0 names.
 *
 * Text edits over the TypeScript AST rather than a reprint: the transform
 * changes identifiers and nothing else, so every byte outside the renamed names
 * — formatting, comments, the odd trailing space — comes back exactly as it was.
 * A reprinted file is a diff nobody wants to review.
 *
 * What it covers, in order of how often it comes up:
 *
 * 1. `import { useMessage } from 'use-everywhere'` and every reference the
 *    binding has in the file. An aliased import (`useMessage as onMessage`)
 *    changes only the imported name, and the alias keeps working.
 * 2. `ns.useMessage(...)` through a namespace import or a `require`.
 * 3. `StoreHooks.get()` → `.store()`, `ChannelHooks.useMessage()` →
 *    `.useOnMessage()`, and `ReactNamespace.defineStore` /
 *    `.useSharedStore`, wherever the receiver is a variable initialised from the
 *    factory in the same file, or the factory call itself.
 *
 * A `.useMessage(` call on a receiver it cannot attribute is reported as a
 * warning rather than rewritten.
 */
export function transform(source: string, filename = 'file.tsx'): TransformResult {
  const file = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(filename),
  );

  const edits: Edit[] = [];
  const warnings: TransformWarning[] = [];
  /** Local bindings whose references must be rewritten, old text → new text. */
  const locals = new Map<string, string>();
  /** `import * as ue from 'use-everywhere'` and `const ue = require(...)` bindings. */
  const namespaceImports = new Set<string>();
  /** Namespace imports of *other* modules: a `.defineStore` on one of these is not ours. */
  const foreignNamespaces = new Set<string>();
  /** Variables initialised from a factory call, by the kind of object they hold. */
  const receivers = new Map<string, ReceiverKind>();
  /** Aliased factory imports (`defineStore as makeStore`), alias → the export it names. */
  const aliases = new Map<string, string>();

  const rename = (node: ts.Node, text: string): void => {
    edits.push({ start: node.getStart(file), end: node.getEnd(), text });
  };

  // Pass 1: the import surface. Everything else keys off what this finds.
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement)) {
      collectImport(statement);
    } else if (ts.isExportDeclaration(statement)) {
      collectExport(statement);
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) collectRequire(declaration);
    }
  }

  // Pass 2: which variables hold a factory's result. Declarations anywhere in
  // the file count — a store defined inside a test's `describe` is still a store.
  const collectReceivers = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const kind = node.initializer && factoryKind(node.initializer);
      if (kind) receivers.set(node.name.text, kind);
    }
    ts.forEachChild(node, collectReceivers);
  };
  collectReceivers(file);

  // Pass 3: references and members.
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) {
      visitIdentifier(node);
    } else if (ts.isPropertyAccessExpression(node)) {
      visitMember(node);
    } else if (ts.isQualifiedName(node)) {
      // `ue.UseMessageOptions` in a type position.
      if (ts.isIdentifier(node.left) && namespaceImports.has(node.left.text)) {
        const target = RENAMES[node.right.text];
        if (target) rename(node.right, target);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);

  return apply();

  function collectImport(node: ts.ImportDeclaration): void {
    if (!ts.isStringLiteral(node.moduleSpecifier)) return;
    const bindings = node.importClause?.namedBindings;
    if (!bindings) return;
    if (node.moduleSpecifier.text !== PACKAGE) {
      if (ts.isNamespaceImport(bindings)) foreignNamespaces.add(bindings.name.text);
      return;
    }
    if (ts.isNamespaceImport(bindings)) {
      namespaceImports.add(bindings.name.text);
      return;
    }
    for (const element of bindings.elements) {
      const imported = element.propertyName ?? element.name;
      const target = RENAMES[imported.text];
      if (!target) continue;
      if (element.propertyName) {
        // `useMessage as onMessage`: the alias is theirs, only the import moves.
        rename(element.propertyName, target);
        aliases.set(element.name.text, imported.text);
      } else {
        rename(element.name, target);
        locals.set(element.name.text, target);
      }
    }
  }

  function collectExport(node: ts.ExportDeclaration): void {
    if (!node.exportClause || !ts.isNamedExports(node.exportClause)) return;
    const fromPackage =
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text === PACKAGE;
    if (!fromPackage) return;
    for (const element of node.exportClause.elements) {
      const imported = element.propertyName ?? element.name;
      const target = RENAMES[imported.text];
      if (!target) continue;
      // The module's own surface is kept: `export { useMessage } from
      // 'use-everywhere'` becomes `export { useOnMessage as useMessage }`, so
      // whoever imports from this barrel is untouched. Renaming their export
      // would be a decision about their API, not about ours.
      if (element.propertyName) rename(element.propertyName, target);
      else rename(element.name, `${target} as ${element.name.text}`);
    }
  }

  function collectRequire(node: ts.VariableDeclaration): void {
    if (!isRequireOf(node.initializer, PACKAGE)) return;
    if (ts.isIdentifier(node.name)) {
      namespaceImports.add(node.name.text);
      return;
    }
    if (!ts.isObjectBindingPattern(node.name)) return;
    for (const element of node.name.elements) {
      const key = element.propertyName ?? element.name;
      if (!ts.isIdentifier(key) || !ts.isIdentifier(element.name)) continue;
      const target = RENAMES[key.text];
      if (!target) continue;
      if (element.propertyName) {
        rename(element.propertyName, target);
      } else {
        rename(element.name, target);
        locals.set(element.name.text, target);
      }
    }
  }

  /** The kind of object a factory call builds, or undefined when `node` is not one. */
  function factoryKind(node: ts.Expression): ReceiverKind | undefined {
    if (!ts.isCallExpression(node)) return undefined;
    const callee = node.expression;
    if (ts.isIdentifier(callee)) {
      // Edits are not applied yet, so a renamed local still reads as its 0.x
      // spelling here; an aliased import is looked up through the alias.
      return FACTORIES[aliases.get(callee.text) ?? callee.text];
    }
    if (ts.isPropertyAccessExpression(callee)) return FACTORIES[callee.name.text];
    return undefined;
  }

  function visitIdentifier(node: ts.Identifier): void {
    const target = locals.get(node.text);
    if (!target) return;
    const parent = node.parent;
    // Positions where the identifier is a *name*, not a reference to the binding.
    if (ts.isPropertyAccessExpression(parent) && parent.name === node) return;
    if (ts.isPropertyAssignment(parent) && parent.name === node) return;
    if (ts.isBindingElement(parent) && parent.propertyName === node) return;
    if (ts.isImportSpecifier(parent) || ts.isImportClause(parent)) return;
    if (ts.isPropertySignature(parent) || ts.isPropertyDeclaration(parent)) return;
    if (ts.isMethodDeclaration(parent) || ts.isMethodSignature(parent)) return;
    if (ts.isJsxAttribute(parent)) return;
    if (ts.isQualifiedName(parent) && parent.right === node) return;
    if (ts.isShorthandPropertyAssignment(parent)) {
      // `{ useMessage }` names the key and the value in one token: keep the key.
      rename(node, `${node.text}: ${target}`);
      return;
    }
    if (ts.isExportSpecifier(parent)) {
      // A bare `export { useMessage }` re-exports the (now renamed) local under
      // the module's existing name, for the same reason `collectExport` does.
      if (parent.propertyName === node) rename(node, target);
      else if (!parent.propertyName) rename(node, `${target} as ${node.text}`);
      return;
    }
    rename(node, target);
  }

  function visitMember(node: ts.PropertyAccessExpression): void {
    const member = node.name.text;
    const receiver = node.expression;

    if (ts.isIdentifier(receiver) && namespaceImports.has(receiver.text)) {
      const target = RENAMES[member];
      if (target) rename(node.name, target);
      return;
    }

    const kind = receiverKind(receiver);
    if (kind) {
      const target = MEMBER_RENAMES[kind][member];
      if (target) rename(node.name, target);
      return;
    }

    if (ts.isIdentifier(receiver) && foreignNamespaces.has(receiver.text)) return;
    const distinctive = DISTINCTIVE_MEMBERS[member];
    if (distinctive) {
      rename(node.name, distinctive);
      return;
    }
    if (
      member === 'useMessage' &&
      ts.isCallExpression(node.parent) &&
      node.parent.expression === node
    ) {
      const { line } = file.getLineAndCharacterOfPosition(node.name.getStart(file));
      warnings.push({
        line: line + 1,
        message:
          `\`${receiver.getText(file)}.useMessage(...)\` was left alone: the receiver is not ` +
          'defined from `defineChannel` in this file. If it is a use-everywhere channel, rename ' +
          'the call to `.useOnMessage(...)` by hand.',
      });
    }
  }

  /** What a member access's receiver is, when the file itself says so. */
  function receiverKind(node: ts.Expression): ReceiverKind | undefined {
    if (ts.isIdentifier(node)) return receivers.get(node.text);
    return factoryKind(node);
  }

  function apply(): TransformResult {
    if (edits.length === 0) return { source, changed: false, warnings };
    // Descending, so earlier offsets stay valid as later text changes length.
    const ordered = [...edits].sort((a, b) => b.start - a.start);
    let out = source;
    let previousStart = Number.POSITIVE_INFINITY;
    for (const edit of ordered) {
      // Two passes can claim the same identifier (a renamed local that is also
      // an export specifier's name); the first claim wins and the rest are
      // dropped rather than spliced into each other.
      if (edit.end > previousStart) continue;
      out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
      previousStart = edit.start;
    }
    return { source: out, changed: out !== source, warnings };
  }
}
