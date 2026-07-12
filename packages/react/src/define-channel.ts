import type { MessageMap, MessageMeta } from '@use-everywhere/core';
import { getChannel } from './registry.js';
import { useChannel, useMessage, useSend } from './use-message.js';
import type { ChannelHooks } from './define-channel.types.js';

/**
 * Bind a channel name and message map once, at module level, and get fully
 * typed hooks back. Sugar over useChannel/useMessage/useSend — the same
 * page-wide channel singleton is shared, so mixing bound and standalone
 * hooks for one name is safe.
 */
export function defineChannel<M extends MessageMap>(name: string): ChannelHooks<M> {
  const useBoundSend = () => useSend(useChannel<M>(name));
  const useBoundMessage = <K extends keyof M & string>(
    type: K,
    handler: (payload: M[K], meta: MessageMeta) => void,
  ) => useMessage(useChannel<M>(name), type, handler);

  return {
    get: () => getChannel<M>(name),
    useSend: useBoundSend,
    useMessage: useBoundMessage,
  };
}
