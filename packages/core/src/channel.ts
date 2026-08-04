import { getBus } from './bus.js';
import type { Channel, ChannelOptions } from './channel.types.js';
import type { MessageMap, MessageMeta } from './common.types.js';
import { newMsgId } from './ids.js';
import { createGate } from './schema.js';

/** Typed pub/sub over the same-origin bus. */
export function createChannel<M extends MessageMap>(
  name: string,
  options: ChannelOptions<M> = {},
): Channel<M> {
  type Handler = (payload: unknown, meta: MessageMeta) => void;
  const bus = getBus(name, options);
  const handlers = new Map<string, Set<Handler>>();
  const gate = createGate(name, options.schema, options.onInvalid);

  const unsubscribe = bus.subscribe((wire) => {
    if (wire.scope !== 'event') return;
    const set = handlers.get(wire.type);
    if (!set) return;
    // Checked only when someone is listening: validating a message no handler
    // wants would report a peer's payload as broken on the say-so of a schema
    // this tab never consults for it.
    if (gate && !gate.accepts(wire.type, wire.payload)) return;
    const meta: MessageMeta = { clientId: wire.clientId, kind: wire.kind, self: false };
    for (const fn of set) fn(wire.payload, meta);
  });

  let closed = false;
  return {
    name,
    clientId: bus.clientId,
    post(type, payload) {
      // Throws rather than drops: a value this tab just built and cannot
      // describe is a bug here, and the alternative is every peer discovering
      // it instead. Same reasoning as the structured-clone pre-check in the
      // store — refuse the write at its source, all-or-nothing.
      gate?.assert(type, payload);
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
