import { structuredCloneSafe } from '../rules/structured-clone-safe.js';
import { ruleTester } from './rule-tester.js';

ruleTester.run('structured-clone-safe', structuredCloneSafe, {
  valid: [
    { code: `const [theme, setTheme] = useSharedState('theme', 'dark');` },
    { code: `useSharedState('cart', { items: [], total: 0, updatedAt: new Date() });` },
    { code: `useSharedState('seen', new Set(['a']));` },
    { code: `useSharedState('bytes', new Uint8Array(4));` },
    { code: `createSharedStore('cart', { items: [{ id: 1, tags: ['a'] }] });` },
    { code: `createSharedReducer('votes', reduce, { count: 0 });` },
    { code: `store.registerKey('theme', 'dark');` },
    // Reducers and selectors are functions on purpose; they never cross the wire.
    { code: `useSharedReducer(reduce, { count: 0 });` },
    // Unknown shapes are left alone rather than guessed at.
    { code: `useSharedState('cart', initialFromProps);` },
    { code: `useSharedState('cart', { ...defaults });` },
    { code: `useSharedState('cart', [...items]);` },
    { code: `useSharedState('cart', someCall());` },
    { code: `useSharedState('cart', new lib.Thing());` },
    { code: `const total = 0;\nuseSharedState('cart', { total });` },
    // Two `var` declarations of one name: ambiguous, so it goes unjudged.
    { code: `var onSave = 1;\nvar onSave = () => {};\nuseSharedState('cart', { onSave });` },
    // Not one of ours.
    { code: `configure('cart', () => {});` },
    // No initial to judge.
    { code: `useSharedState('cart');` },
    // Declared but unassigned: not yet a function, not yet anything.
    { code: `let onSave;\nuseSharedState('cart', { onSave });` },
  ],
  invalid: [
    {
      code: `useSharedState('cart', { onCheckout: () => {} });`,
      errors: [{ messageId: 'notCloneable', data: { what: 'a function' } }],
    },
    {
      code: `useSharedState('cart', function () {});`,
      errors: [{ messageId: 'notCloneable' }],
    },
    {
      code: `createSharedStore('cart', { rows: [() => {}] });`,
      errors: [{ messageId: 'notCloneable' }],
    },
    {
      code: `useSharedState('cart', { Renderer: class {} });`,
      errors: [{ messageId: 'notCloneable', data: { what: 'a class' } }],
    },
    {
      code: `useSharedState('pending', new Promise(() => {}));`,
      errors: [{ messageId: 'notCloneable', data: { what: 'a Promise' } }],
    },
    {
      code: `useSharedState('cache', { byId: new WeakMap() });`,
      errors: [{ messageId: 'notCloneable', data: { what: 'a WeakMap' } }],
    },
    {
      code: `useSharedState('id', Symbol('cart'));`,
      errors: [{ messageId: 'notCloneable', data: { what: 'a symbol' } }],
    },
    {
      code: `useSharedState('user', new User('ada'));`,
      errors: [{ messageId: 'prototypeLost', data: { name: 'User' } }],
    },
    {
      code: `createSharedReducer('votes', reduce, { at: new URL('/x', origin) });`,
      errors: [{ messageId: 'prototypeLost', data: { name: 'URL' } }],
    },
    {
      code: `function onSave() {}\nuseSharedState('cart', { onSave });`,
      errors: [{ messageId: 'notCloneable', data: { what: 'a function' } }],
    },
    {
      code: `const onSave = () => {};\nuseSharedState('cart', { onSave });`,
      errors: [{ messageId: 'notCloneable' }],
    },
    {
      code: `store.registerKey('cart', { onSave: function () {} });`,
      errors: [{ messageId: 'notCloneable' }],
    },
    // Two problems in one literal are two reports.
    {
      code: `useSharedState('cart', { onSave: () => {}, user: new User('ada') });`,
      errors: [{ messageId: 'notCloneable' }, { messageId: 'prototypeLost' }],
    },
  ],
});
