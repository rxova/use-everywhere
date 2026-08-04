---
'use-everywhere': minor
---

`useMessage` takes options, and request/response gets hooks.

**`useMessage(channel, type, handler, { enabled, once })`.** `enabled: false` unsubscribes rather than filtering inside the handler, so a component that is not interested costs nothing — and it is the answer to the thing you cannot do, which is call the hook conditionally.

**`useAnswer(channel, type, responder)`** answers `ask`s for as long as the component is mounted, and stands down when it unmounts. A hook rather than a bare `channel.answer()` call because a responder is a subscription: registering one during render would leave the last unmounted component answering for the whole page. The responder is kept fresh without resubscribing, so it may close over render state.

**`useAsk(channel)`** returns the channel's `ask` with a stable identity, like `useSend`.

`useChannel` gains the optional reply-map type parameter:

```tsx
const channel = useChannel<Requests, Replies>('app');
useAnswer(channel, 'config:get', () => ({ theme }));
const ask = useAsk(channel);
```

Existing `useChannel<Requests>('app')` calls are unchanged — the reply map defaults to empty, which is what makes `ask`/`answer` opt-in rather than `unknown`.
