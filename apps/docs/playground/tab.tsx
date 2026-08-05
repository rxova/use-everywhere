import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

/**
 * One simulated tab in the docs playground.
 *
 * Every frame on this page is a genuine client: same origin, same
 * `BroadcastChannel`, no coordination between them other than the bus itself.
 * Nothing is faked, which is the entire point — a reader can open the same page
 * in a second browser window and it joins in.
 *
 * ## The one piece of stagecraft
 *
 * A tab that *crashes* stops talking without saying goodbye, and that is the
 * most interesting thing this page can show: peers have to notice, because
 * nobody told them. Simulating it needs a way to cut this frame's wire, and the
 * hooks own the transport — deliberately, since an app should not have to.
 *
 * So the frame wraps `BroadcastChannel` before importing the library, keeps a
 * reference to every channel it opens, and `crash()` makes them mute and deaf:
 * outgoing posts are dropped and the delivery handler is detached. From every
 * other frame's point of view that is indistinguishable from a tab that died —
 * no `bye`, no resignation, just silence.
 *
 * Closing the channels outright would be closer to the metal and is wrong here:
 * a closed channel *throws* on the next post, and the library's heartbeat timers
 * are still running in this very-much-alive frame. A real crashed tab does not
 * run timers, so the exceptions would be an artifact of the simulation rather
 * than anything a user could hit.
 *
 * The wrapper has to be installed before the library is imported, which is why
 * the import below is dynamic. That is the whole of the trick; everything else
 * on this page is the library being used the way anyone would use it.
 */
const opened: CuttableChannel[] = [];

class CuttableChannel extends window.BroadcastChannel {
  private cut = false;

  constructor(name: string) {
    super(name);
    opened.push(this);
  }

  override postMessage(data: unknown): void {
    if (!this.cut) super.postMessage(data);
  }

  /** Mute and deafen. The channel stays open; nothing goes in or out again. */
  kill(): void {
    this.cut = true;
    // The transport delivers through `onmessage`, so dropping it is enough —
    // and unlike close(), it cannot throw on the way past.
    this.onmessage = null;
  }
}

window.BroadcastChannel = CuttableChannel as typeof BroadcastChannel;

const { useLeader, usePeers, useSharedState } = await import('use-everywhere');

const BUS = 'ue-playground';
const label = new URLSearchParams(location.search).get('label') ?? '?';

function Tab() {
  const [items, setItems] = useSharedState('items', 0, { store: BUS });
  const [note, setNote] = useSharedState('note', '', { store: BUS });
  const peers = usePeers({ name: BUS, includeSelf: true });
  // The heartbeat election, pinned rather than left on `auto`.
  //
  // A crash here is a cut wire in a frame that is still running, and Web Locks
  // releases a lock when the context *dies* — so the browser would keep handing
  // the seat to a frame that can no longer use it, and the most interesting
  // moment would show nothing. Under the lease, silence is what loses the seat,
  // which is what the reader should get to watch. Short timings so it happens
  // while they are still looking.
  const { isLeader, leaderId } = useLeader({
    name: BUS,
    strategy: 'heartbeat',
    heartbeatMs: 400,
    leaseMs: 1600,
  });

  const [dead, setDead] = useState(false);
  const noteRef = useRef<HTMLInputElement>(null);

  // The input follows the store, except in the frame currently being typed in —
  // otherwise a peer's keystroke would move this frame's caret.
  useEffect(() => {
    const input = noteRef.current;
    if (input && document.activeElement !== input) input.value = note;
  }, [note]);

  const crash = () => {
    for (const channel of opened) channel.kill();
    setDead(true);
  };

  return (
    <div className={`tab${dead ? ' tab--dead' : ''}`}>
      <header className="tab__bar">
        <span className="tab__name">tab {label}</span>
        <span className={`tab__seat${isLeader ? ' tab__seat--leader' : ''}`}>
          {dead ? 'gone' : isLeader ? '♔ leader' : leaderId ? 'follower' : 'no leader'}
        </span>
      </header>

      <div className="tab__row">
        <span className="tab__k">cart</span>
        <button type="button" onClick={() => setItems((n) => Math.max(0, n - 1))}>
          −
        </button>
        <output className="tab__count">{items}</output>
        <button type="button" onClick={() => setItems((n) => n + 1)}>
          +
        </button>
      </div>

      <div className="tab__row">
        <span className="tab__k">note</span>
        <input
          ref={noteRef}
          className="tab__note"
          defaultValue={note}
          placeholder="type here"
          onChange={(event) => setNote(event.target.value)}
        />
      </div>

      <div className="tab__row tab__row--foot">
        <span className="tab__k">here</span>
        <span className="tab__peers">{peers.length}</span>
        <button type="button" className="tab__crash" onClick={crash} disabled={dead}>
          crash
        </button>
      </div>

      {dead ? <div className="tab__veil">wire cut — no goodbye sent</div> : null}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Tab />);
