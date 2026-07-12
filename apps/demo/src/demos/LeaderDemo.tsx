import { useState } from 'react';
import { useLeader, useLeaderEffect, useSharedState } from 'use-everywhere';

/**
 * One tab drives the ticker; every tab reads it. This is the multi-tab bug the
 * whole feature exists for: without an election, N tabs would each run their
 * own interval and fight over the same key.
 */
export function LeaderDemo() {
  const [eligible, setEligible] = useState(true);
  const { leaderId, isLeader } = useLeader({ eligible });
  const [ticks, setTicks] = useSharedState('ticker', 0);

  useLeaderEffect(() => {
    const id = setInterval(() => setTicks((n) => n + 1), 1000);
    return () => clearInterval(id);
  });

  return (
    <section className="card">
      <h2>Leader election</h2>
      <p className="hint">
        Exactly one tab runs the ticker. Open more tabs — the crown does not move. Close the leader
        and it is handed over instantly; kill it and the others take ~3s to notice.
      </p>

      <p style={{ fontSize: '2rem', margin: '0.4rem 0', fontVariantNumeric: 'tabular-nums' }}>
        {ticks}
      </p>

      <p>
        {isLeader ? (
          <strong>♔ this tab is driving</strong>
        ) : leaderId ? (
          <span>following {leaderId.slice(0, 6)}</span>
        ) : (
          <span>no leader yet…</span>
        )}
      </p>

      <label>
        <input type="checkbox" checked={eligible} onChange={(e) => setEligible(e.target.checked)} />{' '}
        this tab may lead
      </label>
    </section>
  );
}
