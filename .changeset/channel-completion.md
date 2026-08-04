---
'@use-everywhere/core': minor
---

Complete the channel: `echo`, `once`, and request/response.

**`post(type, payload, { echo: true })`** delivers to this client's handlers as well. Not echoing is the `BroadcastChannel` default and usually right, but it was wrong for the case the README kept demonstrating: a component that updates locally _and_ tells everyone else writes the same effect twice, in two places, which then drift. `meta.self` is `true` on the echoed copy, so one handler can serve both.

**`on(type, handler, { once: true })`** unsubscribes after the first message. The returned unsubscribe stays safe to call afterwards.

**`ask(type, payload)` / `answer(type, responder)`** — request/response, which is what finally gives `msgId` a job. It was generated on every message and read by nothing: dead wire weight, or an unfinished feature, depending on how charitable you were feeling. A reply carries `replyTo: <the question's msgId>`, so it reaches the client that asked and nobody else — a bystander subscribed to that message type sees the question and not the answer.

```ts
type Requests = { 'config:get': null };
type Replies = { 'config:get': { theme: string } };
const channel = createChannel<Requests, Replies>('app');

channel.answer('config:get', () => ({ theme: currentTheme }));
const { theme } = await channel.ask('config:get', null);
```

Replies are a second, separate type map, empty by default, so `ask`/`answer` are opt-in and typed rather than `unknown` everywhere. `Channel<M>` keeps working unchanged.

`ask` **rejects on timeout** (default 5s) rather than hanging — an unanswered question is a fact worth having. If several clients answer, the first reply wins; gate the responder on leadership when it has to be a particular tab. A payload its schema rejects surfaces that error immediately instead of timing out five seconds later on a question that never left.

Adding `replyTo` is additive within wire v1: a build that predates `ask` neither sets nor reads it, which is exactly the rule for new optional fields.
