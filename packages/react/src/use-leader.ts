import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type { LeaderSnapshot } from '@use-everywhere/core';
import { DEFAULT_NAME, getLeader } from './registry.js';
import type { UseLeaderOptions } from './use-leader.types.js';

const NO_LEADER: LeaderSnapshot = Object.freeze({ leaderId: null, isLeader: false });

/**
 * Who currently holds the seat on this bus, and whether it is us. Exactly one
 * tab leads; opening another does not steal it, and closing the leader hands it
 * over at once.
 */
export function useLeader(options?: UseLeaderOptions): LeaderSnapshot {
  const leader = getLeader(options?.name ?? DEFAULT_NAME, options);

  const eligible = options?.eligible;
  useEffect(() => {
    // Only when the caller actually said something. Eligibility belongs to the
    // tab, not to a component, so a passive reader elsewhere in the tree must
    // not be able to re-enrol a tab that deliberately opted out.
    if (eligible === undefined) return;
    leader.setEligible(eligible);
  }, [leader, eligible]);

  return useSyncExternalStore(
    useCallback((onChange) => leader.subscribe(onChange), [leader]),
    () => leader.getSnapshot(),
    () => NO_LEADER,
  );
}

/** Is this tab the leader? */
export function useIsLeader(options?: UseLeaderOptions): boolean {
  return useLeader(options).isLeader;
}

/**
 * Run an effect only in the tab that holds the seat, and tear it down when the
 * seat moves. The one place to put "exactly one tab owns the socket".
 */
export function useLeaderEffect(
  effect: () => void | (() => void),
  options?: UseLeaderOptions,
): void {
  const { isLeader } = useLeader(options);
  const effectRef = useRef(effect);
  useEffect(() => {
    effectRef.current = effect;
  });

  // Deps are [isLeader] alone, on purpose: the effect starts on winning the
  // seat and stops on losing it. Depending on the callback's identity would
  // reconnect an inline arrow's WebSocket on every render.
  useEffect(() => {
    if (!isLeader) return;
    return effectRef.current();
  }, [isLeader]);
}
