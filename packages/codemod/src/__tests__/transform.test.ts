import { describe, expect, it } from 'vitest';
import { EXTENSIONS, RENAMES, transform } from '../transform.js';

const rewrite = (source: string, filename?: string) => transform(source, filename).source;

describe('the rename table', () => {
  it('is the RFC 0001 table, and nothing else', () => {
    expect(RENAMES).toEqual({
      useMessage: 'useOnMessage',
      useOpenedWindow: 'useWindowResult',
      defineStore: 'createStoreHooks',
      useSharedStore: 'useSharedSelector',
      UseMessageOptions: 'UseOnMessageOptions',
      DefineStoreOptions: 'CreateStoreHooksOptions',
      UseOpenedWindow: 'UseWindowResult',
    });
  });

  it('parses every extension the runner walks', () => {
    for (const extension of EXTENSIONS) {
      expect(transform(`const x = 1;`, `a${extension}`).changed).toBe(false);
    }
  });
});

describe('named imports', () => {
  it('renames the import and every reference to it', () => {
    const input = [
      `import { useChannel, useMessage } from 'use-everywhere';`,
      `function A() {`,
      `  const ch = useChannel('x');`,
      `  useMessage(ch, 'ping', () => {});`,
      `}`,
    ].join('\n');

    expect(rewrite(input)).toBe(
      [
        `import { useChannel, useOnMessage } from 'use-everywhere';`,
        `function A() {`,
        `  const ch = useChannel('x');`,
        `  useOnMessage(ch, 'ping', () => {});`,
        `}`,
      ].join('\n'),
    );
  });

  it('renames only the imported name when it is aliased', () => {
    const input = `import { useMessage as onMessage } from 'use-everywhere';\nonMessage(c, 't', h);`;

    expect(rewrite(input)).toBe(
      `import { useOnMessage as onMessage } from 'use-everywhere';\nonMessage(c, 't', h);`,
    );
  });

  it('renames type imports, inline and clause-level', () => {
    const input = [
      `import type { UseMessageOptions, DefineStoreOptions } from 'use-everywhere';`,
      `import { type UseOpenedWindow, openWindow } from 'use-everywhere';`,
      `let a: UseMessageOptions;`,
      `let b: DefineStoreOptions = {};`,
      `let c: UseOpenedWindow<{}, {}, string>;`,
    ].join('\n');

    expect(rewrite(input)).toBe(
      [
        `import type { UseOnMessageOptions, CreateStoreHooksOptions } from 'use-everywhere';`,
        `import { type UseWindowResult, openWindow } from 'use-everywhere';`,
        `let a: UseOnMessageOptions;`,
        `let b: CreateStoreHooksOptions = {};`,
        `let c: UseWindowResult<{}, {}, string>;`,
      ].join('\n'),
    );
  });

  it('leaves the same names alone when they come from another package', () => {
    const input = `import { defineStore } from 'pinia';\nexport const useCart = defineStore('cart', {});`;

    expect(transform(input).changed).toBe(false);
  });

  it('leaves a file with nothing to do byte-identical', () => {
    const input = `import { useSharedState } from 'use-everywhere';\n\n// trailing space \n`;
    const result = transform(input);

    expect(result.changed).toBe(false);
    expect(result.source).toBe(input);
  });

  it('keeps an object key that happens to share the name', () => {
    const input = [
      `import { useMessage } from 'use-everywhere';`,
      `const api = { useMessage: 1, other: useMessage };`,
      `api.useMessage;`,
    ].join('\n');

    expect(rewrite(input)).toBe(
      [
        `import { useOnMessage } from 'use-everywhere';`,
        `const api = { useMessage: 1, other: useOnMessage };`,
        `api.useMessage;`,
      ].join('\n'),
    );
  });

  it('expands a shorthand property so the key survives the rename', () => {
    const input = `import { defineStore } from 'use-everywhere';\nexport default { defineStore };`;

    expect(rewrite(input)).toBe(
      `import { createStoreHooks } from 'use-everywhere';\nexport default { defineStore: createStoreHooks };`,
    );
  });

  it('keeps a bare re-export of the local under the module’s existing name', () => {
    const input = `import { useMessage } from 'use-everywhere';\nexport { useMessage };`;

    expect(rewrite(input)).toBe(
      `import { useOnMessage } from 'use-everywhere';\nexport { useOnMessage as useMessage };`,
    );
  });

  it('renames the source side of an aliased local re-export', () => {
    const input = `import { useMessage } from 'use-everywhere';\nexport { useMessage as listen };`;

    expect(rewrite(input)).toBe(
      `import { useOnMessage } from 'use-everywhere';\nexport { useOnMessage as listen };`,
    );
  });

  it('does not touch a class member, interface member or JSX attribute of the same name', () => {
    const input = [
      `import { useMessage } from 'use-everywhere';`,
      `interface I { useMessage: number }`,
      `class C { useMessage = 1; useMessage() {} }`,
      `const el = <div useMessage={useMessage} />;`,
      `type Q = ns.useMessage;`,
    ].join('\n');

    expect(rewrite(input, 'a.tsx')).toBe(
      [
        `import { useOnMessage } from 'use-everywhere';`,
        `interface I { useMessage: number }`,
        `class C { useMessage = 1; useMessage() {} }`,
        `const el = <div useMessage={useOnMessage} />;`,
        `type Q = ns.useMessage;`,
      ].join('\n'),
    );
  });

  it('keeps a destructuring key that names a renamed local elsewhere', () => {
    const input = [
      `import { useMessage } from 'use-everywhere';`,
      `const { useMessage: fromProps } = props;`,
      `useMessage(c, 't', fromProps);`,
    ].join('\n');

    expect(rewrite(input)).toBe(
      [
        `import { useOnMessage } from 'use-everywhere';`,
        `const { useMessage: fromProps } = props;`,
        `useOnMessage(c, 't', fromProps);`,
      ].join('\n'),
    );
  });
});

describe('re-exports from the package', () => {
  it('keeps a barrel’s surface by aliasing the new name to the old', () => {
    const input = `export { useMessage, useSharedState } from 'use-everywhere';`;

    expect(rewrite(input)).toBe(
      `export { useOnMessage as useMessage, useSharedState } from 'use-everywhere';`,
    );
  });

  it('renames the source side of an already-aliased barrel export', () => {
    const input = `export { useOpenedWindow as useWindow } from 'use-everywhere';`;

    expect(rewrite(input)).toBe(`export { useWindowResult as useWindow } from 'use-everywhere';`);
  });

  it('ignores barrel exports of other packages and star exports', () => {
    const input = `export { defineStore } from 'pinia';\nexport * from 'use-everywhere';`;

    expect(transform(input).changed).toBe(false);
  });
});

describe('namespace imports', () => {
  it('renames members reached through import * as', () => {
    const input = [
      `import * as ue from 'use-everywhere';`,
      `const s = ue.defineStore('s');`,
      `ue.useMessage(ue.useChannel('c'), 't', () => {});`,
      `let o: ue.UseMessageOptions;`,
      `s.get().set('k', 1);`,
    ].join('\n');

    expect(rewrite(input)).toBe(
      [
        `import * as ue from 'use-everywhere';`,
        `const s = ue.createStoreHooks('s');`,
        `ue.useOnMessage(ue.useChannel('c'), 't', () => {});`,
        `let o: ue.UseOnMessageOptions;`,
        `s.store().set('k', 1);`,
      ].join('\n'),
    );
  });

  it('never rewrites a namespace import of another module', () => {
    const input = `import * as pinia from 'pinia';\nexport const useCart = pinia.defineStore('cart');`;

    expect(transform(input).changed).toBe(false);
  });
});

describe('CommonJS', () => {
  it('renames a destructured require and its references', () => {
    const input = [
      `const { useMessage, useChannel } = require('use-everywhere');`,
      `useMessage(useChannel('c'), 't', () => {});`,
    ].join('\n');

    expect(rewrite(input, 'a.cjs')).toBe(
      [
        `const { useOnMessage, useChannel } = require('use-everywhere');`,
        `useOnMessage(useChannel('c'), 't', () => {});`,
      ].join('\n'),
    );
  });

  it('renames only the key of an aliased require binding', () => {
    const input = `const { defineStore: makeStore } = require('use-everywhere');\nconst s = makeStore('s');`;

    expect(rewrite(input, 'a.cjs')).toBe(
      `const { createStoreHooks: makeStore } = require('use-everywhere');\nconst s = makeStore('s');`,
    );
  });

  it('treats a whole-module require as a namespace', () => {
    const input = `const ue = require('use-everywhere');\nue.useSharedStore((s) => s.a);`;

    expect(rewrite(input, 'a.cjs')).toBe(
      `const ue = require('use-everywhere');\nue.useSharedSelector((s) => s.a);`,
    );
  });

  it('ignores requires of other modules and non-identifier patterns', () => {
    const input = [
      `const { defineStore } = require('pinia');`,
      `const [first] = require('use-everywhere');`,
      `const { ...rest } = require('use-everywhere');`,
      `const { 'useMessage': quoted } = require('use-everywhere');`,
    ].join('\n');

    expect(transform(input, 'a.cjs').changed).toBe(false);
  });
});

describe('members of what the factories return', () => {
  it('renames StoreHooks.get() on a variable built from defineStore', () => {
    const input = [
      `import { defineStore } from 'use-everywhere';`,
      `const settings = defineStore('settings');`,
      `settings.get().set('theme', 'dark');`,
      `defineStore('other').get();`,
    ].join('\n');

    expect(rewrite(input)).toBe(
      [
        `import { createStoreHooks } from 'use-everywhere';`,
        `const settings = createStoreHooks('settings');`,
        `settings.store().set('theme', 'dark');`,
        `createStoreHooks('other').store();`,
      ].join('\n'),
    );
  });

  it('renames .get() on a store built through an aliased import', () => {
    const input = [
      `import { defineStore as makeStore } from 'use-everywhere';`,
      `const s = makeStore('s');`,
      `s.get();`,
    ].join('\n');

    expect(rewrite(input)).toBe(
      [
        `import { createStoreHooks as makeStore } from 'use-everywhere';`,
        `const s = makeStore('s');`,
        `s.store();`,
      ].join('\n'),
    );
  });

  it('renames .get() on a store already spelled createStoreHooks', () => {
    const input = `const s = createStoreHooks('s');\ns.get();`;

    expect(rewrite(input)).toBe(`const s = createStoreHooks('s');\ns.store();`);
  });

  it('leaves .get() alone on anything else', () => {
    const input = [
      `import { defineChannel } from 'use-everywhere';`,
      `const map = new Map();`,
      `map.get('k');`,
      `defineChannel('c').get();`,
      `cache.get();`,
    ].join('\n');

    expect(transform(input).changed).toBe(false);
  });

  it('renames ChannelHooks.useMessage on a variable built from defineChannel', () => {
    const input = [
      `import { defineChannel } from 'use-everywhere';`,
      `const shop = defineChannel('shop');`,
      `function Badge() { shop.useMessage('cart', () => {}); return null; }`,
      `defineChannel('x').useMessage('t', () => {});`,
    ].join('\n');

    expect(rewrite(input)).toBe(
      [
        `import { defineChannel } from 'use-everywhere';`,
        `const shop = defineChannel('shop');`,
        `function Badge() { shop.useOnMessage('cart', () => {}); return null; }`,
        `defineChannel('x').useOnMessage('t', () => {});`,
      ].join('\n'),
    );
  });

  it('renames the namespace members, and the stores and channels they build', () => {
    const input = [
      `import { createNamespace } from 'use-everywhere';`,
      `const checkout = createNamespace('checkout');`,
      `const cart = checkout.defineStore('cart');`,
      `const events = checkout.defineChannel('events');`,
      `const total = checkout.useSharedStore((s) => s.total);`,
      `cart.get();`,
      `events.useMessage('t', () => {});`,
      `createNamespace('other').defineStore('x').get();`,
    ].join('\n');

    expect(rewrite(input)).toBe(
      [
        `import { createNamespace } from 'use-everywhere';`,
        `const checkout = createNamespace('checkout');`,
        `const cart = checkout.createStoreHooks('cart');`,
        `const events = checkout.defineChannel('events');`,
        `const total = checkout.useSharedSelector((s) => s.total);`,
        `cart.store();`,
        `events.useOnMessage('t', () => {});`,
        `createNamespace('other').createStoreHooks('x').store();`,
      ].join('\n'),
    );
  });

  it('renames the distinctive namespace members on a receiver it cannot type', () => {
    const input = [
      `import { checkout } from './bus';`,
      `const cart = checkout.defineStore('cart');`,
      `const total = checkout.useSharedStore((s) => s.total);`,
      `cart.get();`,
    ].join('\n');

    expect(rewrite(input)).toBe(
      [
        `import { checkout } from './bus';`,
        `const cart = checkout.createStoreHooks('cart');`,
        `const total = checkout.useSharedSelector((s) => s.total);`,
        `cart.store();`,
      ].join('\n'),
    );
  });

  it('warns about a .useMessage() call on a receiver it cannot attribute, and leaves it', () => {
    const input = [
      `import { message } from 'antd';`,
      `const [api, holder] = message.useMessage();`,
      `events.useMessage;`,
    ].join('\n');
    const result = transform(input);

    expect(result.changed).toBe(false);
    expect(result.warnings).toEqual([
      { line: 2, message: expect.stringContaining('`message.useMessage(...)` was left alone') },
    ]);
  });

  it('does not treat a call it cannot classify as a factory', () => {
    const input = `const s = makeThing('s');\nconst t = (0, fn)('t');\ns.get();\nt.get();`;

    expect(transform(input).changed).toBe(false);
  });
});

describe('formatting', () => {
  it('preserves every byte it does not rename', () => {
    const input = [
      `import {  useMessage ,useOpenedWindow } from "use-everywhere" // trailing`,
      ``,
      `\t/* odd indentation */ useMessage( c , 't' , () => {} )  `,
      `const w = useOpenedWindow(() => open())`,
      ``,
    ].join('\r\n');

    expect(rewrite(input)).toBe(
      [
        `import {  useOnMessage ,useWindowResult } from "use-everywhere" // trailing`,
        ``,
        `\t/* odd indentation */ useOnMessage( c , 't' , () => {} )  `,
        `const w = useWindowResult(() => open())`,
        ``,
      ].join('\r\n'),
    );
  });

  it('falls back to TSX for an unknown extension', () => {
    const input = `import { useMessage } from 'use-everywhere';\nconst x = <a>{useMessage}</a>;`;

    expect(rewrite(input, 'weird.txt')).toBe(
      `import { useOnMessage } from 'use-everywhere';\nconst x = <a>{useOnMessage}</a>;`,
    );
  });
});
