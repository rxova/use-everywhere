import { noDynamicName } from '../rules/no-dynamic-name.js';
import { ruleTester } from './rule-tester.js';

ruleTester.run('no-dynamic-name', noDynamicName, {
  valid: [
    { code: `const cart = defineStore('cart');` },
    { code: `const chat = defineChannel(\`chat\`);` },
    { code: `const CART = 'cart';\nconst cart = createSharedStore(CART, {});` },
    { code: `const CART = 'cart';\nfunction Cart() { return getSharedStore(CART); }` },
    // A `names.ts` of exported constants is the shape the rule wants.
    { code: `import { CART } from './names';\nconst p = createPresence(CART);` },
    // The default name is static.
    { code: `const chat = defineChannel();` },
    // A dynamic *key* is supported; only names fork the bus.
    { code: `function Row({ id }) { return useSharedState(\`row-\${id}\`, null); }` },
    // Not one of ours.
    { code: `const thing = createThing(id);` },
    // Spread: nothing to judge, so nothing to say.
    { code: `const args = ['cart'];\nconst cart = defineStore(...args);` },
  ],
  invalid: [
    {
      code: `function Cart({ id }) { return getSharedStore(id); }`,
      errors: [{ messageId: 'dynamicName', data: { name: 'getSharedStore' } }],
    },
    {
      code: `const cart = defineStore(\`cart-\${window.location.host}\`);`,
      errors: [{ messageId: 'dynamicName' }],
    },
    {
      code: `let CART = 'cart';\nconst cart = createSharedStore(CART, {});`,
      errors: [{ messageId: 'dynamicName' }],
    },
    {
      code: `const CART = prefix + 'cart';\nconst cart = createChannel(CART);`,
      errors: [{ messageId: 'dynamicName' }],
    },
    {
      code: `function make(name) { return createLeader(name); }`,
      errors: [{ messageId: 'dynamicName' }],
    },
    // Module scope is not enough on its own — the binding has to be a string.
    {
      code: `function CART() {}\nconst chat = createChannel(CART);`,
      errors: [{ messageId: 'dynamicName' }],
    },
    // Undeclared: nothing to resolve, so nothing vouches for it.
    {
      code: `const chat = createChannel(CHAT_NAME);`,
      errors: [{ messageId: 'dynamicName' }],
    },
    {
      code: `const n = createNamespace(String(1));`,
      errors: [{ messageId: 'dynamicName' }],
    },
    {
      code: `function Chat({ id }) { return createSharedReducer(id, reduce, {}); }`,
      errors: [{ messageId: 'dynamicName' }],
    },
    {
      code: `function useSeat({ id }) { return getLeader(id); }`,
      errors: [{ messageId: 'dynamicName' }],
    },
  ],
});
