import { getBus } from './bus.js';
import type { Channel, ChannelOptions, ReplyMap } from './channel.types.js';
import type { MessageMap, MessageMeta } from './common.types.js';
import { newMsgId } from './ids.js';
import { createGate } from './schema.js';

/** Typed pub/sub over the same-origin bus. */
export function createChannel<M extends MessageMap, R extends ReplyMap<M> = Record<never, never>>(
  name: string,
  options: ChannelOptions<M> = {},
): Channel<M, R> {
  type Handler = (payload: unknown, meta: MessageMeta) => void;
  const bus = getBus(name, options);
  const handlers = new Map<string, Set<Handler>>();
  const responders = new Map<string, (payload: unknown, meta: MessageMeta) => unknown>();
  /** Questions this client is waiting on, by the msgId it asked with. */
  const waiting = new Map<string, (value: unknown) => void>();
  const gate = createGate(name, options.schema, options.onInvalid);

  const deliver = (type: string, payload: unknown, meta: MessageMeta) => {
    const set = handlers.get(type);
    if (!set) return;
    // Copied before iterating: a `once` handler removes itself from this very
    // set while it runs, and mutating a Set mid-iteration is how a second
    // handler gets skipped.
    for (const fn of [...set]) fn(payload, meta);
  };

  const unsubscribe = bus.subscribe((wire) => {
    if (wire.scope !== 'event') return;
    const meta: MessageMeta = { clientId: wire.clientId, kind: wire.kind, self: false };

    if (wire.replyTo !== undefined) {
      // An answer to something this client asked. Anyone else's answer to
      // anyone else's question is simply not ours to hold.
      const settle = waiting.get(wire.replyTo);
      if (!settle) return;
      waiting.delete(wire.replyTo);
      settle(wire.payload);
      return;
    }

    const responder = responders.get(wire.type);
    if (responder) {
      bus.post({
        v: 1,
        scope: 'event',
        type: wire.type,
        payload: responder(wire.payload, meta),
        clientId: bus.clientId,
        kind: bus.kind,
        msgId: newMsgId(),
        replyTo: wire.msgId,
      });
    }

    // Checked only when someone is listening: validating a message no handler
    // wants would report a peer's payload as broken on the say-so of a schema
    // this tab never consults for it.
    if (!handlers.has(wire.type)) return;
    if (gate && !gate.accepts(wire.type, wire.payload)) return;
    deliver(wire.type, wire.payload, meta);
  });

  let closed = false;
  const send = (type: string, payload: unknown, msgId: string) => {
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
      msgId,
    });
  };

  return {
    name,
    clientId: bus.clientId,
    post(type, payload, options) {
      send(type, payload, newMsgId());
      if (options?.echo) {
        deliver(type, payload, { clientId: bus.clientId, kind: bus.kind, self: true });
      }
    },
    on(type, handler, options) {
      let set = handlers.get(type);
      if (!set) {
        set = new Set();
        handlers.set(type, set);
      }
      const entry: Handler = options?.once
        ? (payload, meta) => {
            set.delete(entry);
            (handler as Handler)(payload, meta);
          }
        : (handler as Handler);
      set.add(entry);
      return () => set.delete(entry);
    },
    ask(type, payload, options) {
      const msgId = newMsgId();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waiting.delete(msgId);
          reject(
            new Error(
              `use-everywhere: nobody answered "${type}" on "${name}" within ${String(options?.timeoutMs ?? 5000)}ms`,
            ),
          );
        }, options?.timeoutMs ?? 5000);
        waiting.set(msgId, (value) => {
          clearTimeout(timer);
          resolve(value as never);
        });
        try {
          send(type, payload, msgId);
        } catch (error) {
          clearTimeout(timer);
          waiting.delete(msgId);
          throw error;
        }
      });
    },
    answer(type, responder) {
      responders.set(type, responder as (payload: unknown, meta: MessageMeta) => unknown);
      return () => responders.delete(type);
    },
    close() {
      if (closed) return;
      closed = true;
      unsubscribe();
      handlers.clear();
      responders.clear();
      // Anything still waiting will never be answered now. Left to time out on
      // its own rather than rejected here: a close during teardown would
      // otherwise produce unhandled rejections in every tab that is closing.
      waiting.clear();
      bus.release();
    },
  };
}
