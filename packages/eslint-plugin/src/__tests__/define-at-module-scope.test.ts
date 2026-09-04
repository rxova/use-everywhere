import { defineAtModuleScope } from '../rules/define-at-module-scope.js';
import { ruleTester } from './rule-tester.js';

ruleTester.run('define-at-module-scope', defineAtModuleScope, {
  valid: [
    {
      code: `import { createStoreHooks } from 'use-everywhere';\nconst cart = createStoreHooks('cart');`,
    },
    { code: `const chat = defineChannel('chat');` },
    { code: `const checkout = createNamespace('checkout');` },
    // A block at module scope still evaluates exactly once.
    { code: `if (import.meta.env.DEV) { createStoreHooks('debug'); }` },
    // Not ours.
    { code: `function Cart() { defineThing('cart'); }` },
    // A computed callee names nothing we can match on.
    { code: `function Cart() { return ns['createStoreHooks']('cart'); }` },
  ],
  invalid: [
    {
      code: `function Cart() { const cart = createStoreHooks('cart'); return null; }`,
      errors: [{ messageId: 'notModuleScope', data: { name: 'createStoreHooks' } }],
    },
    {
      code: `const useChat = () => defineChannel('chat');`,
      errors: [{ messageId: 'notModuleScope' }],
    },
    {
      code: `function setup() { return createNamespace('checkout'); }`,
      errors: [{ messageId: 'notModuleScope' }],
    },
    // Namespaced factories are the same call by another route.
    {
      code: `import { ns } from './ns';\nfunction Cart() { return ns.createStoreHooks('cart'); }`,
      errors: [{ messageId: 'notModuleScope' }],
    },
  ],
});
