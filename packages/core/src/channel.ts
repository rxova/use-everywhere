import { getBus } from './bus.js';
import type { Channel } from './channel.types.js';
import type { CommonOptions, MessageMap, MessageMeta } from './common.types.js';
import { newMsgId } from './ids.js';

/** Typed pub/sub over the same-origin bus. */
export function createChannel<M extends MessageMap>(
  name: string,
  options: CommonOptions = {},
): Channel<M> {
  type Handler = (payload: unknown, meta: MessageMeta) => void;
  const bus = getBus(name, options);
  const handlers = new Map<string, Set<Handler>>();

  const unsubscribe = bus.subscribe((wire) => {
    if (wire.scope !== 'event') return;
    const set = handlers.get(wire.type);
    if (!set) return;
    const meta: MessageMeta = { clientId: wire.clientId, kind: wire.kind, self: false };
    for (const fn of set) fn(wire.payload, meta);
  });

  let closed = false;
  return {
    name,
    clientId: bus.clientId,
    post(type, payload) {
      bus.post({
        v: 1,
        scope: 'event',
        type,
        payload,
        clientId: bus.clientId,
        kind: bus.kind,
        msgId: newMsgId(),
      });
    },
    on(type, handler) {
      let set = handlers.get(type);
      if (!set) {
        set = new Set();
        handlers.set(type, set);
      }
      set.add(handler as Handler);
      return () => set.delete(handler as Handler);
    },
    close() {
      if (closed) return;
      closed = true;
      unsubscribe();
      handlers.clear();
      bus.release();
    },
  };
}
