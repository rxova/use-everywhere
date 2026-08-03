import { useClientId, usePeers } from 'use-everywhere';
import { colorOf } from '../origins.js';

export function PresenceStrip() {
  const peers = usePeers();
  const clientId = useClientId();
  const workerCount = peers.filter((peer) => peer.kind === 'worker').length;

  return (
    <div className="presence">
      <div className="dot me" style={{ background: colorOf(clientId) }} />
      <span>this tab · {clientId}</span>
      <span>·</span>
      <div
        className="peers"
        data-testid="peers"
        data-peer-count={peers.length}
        data-worker-count={workerCount}
      >
        {peers.length === 0 ? (
          <span className="peers-empty">no other tabs yet — open this page again</span>
        ) : (
          peers.map((peer) => (
            <div
              key={peer.id}
              className={`dot${peer.kind === 'worker' ? ' worker' : ''}`}
              style={{ background: colorOf(peer.id) }}
              title={`${peer.kind} · ${peer.id}`}
            />
          ))
        )}
      </div>
    </div>
  );
}
