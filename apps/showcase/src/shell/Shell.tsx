import { useEffect, useState, type ReactNode } from 'react';
import { useClientId, usePeers } from 'use-everywhere';
import { GROUPS, PAGES } from './pages.js';
import { ThemeToggle } from './theme.js';
import { hrefFor } from '../router.js';

/**
 * A stable colour per client id, so the same tab is the same dot everywhere.
 * Hues are confined to the rxova logo's blue -> violet -> magenta arc (209deg to
 * 326deg) rather than the whole wheel, so a crowd of tabs still reads as brand.
 */
export function colorOf(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return `hsl(${209 + (Math.abs(hash) % 118)} 72% 60%)`;
}

function PeerStrip() {
  const self = useClientId();
  const peers = usePeers({ includeSelf: true });

  return (
    <div className="peers" title="Every client on this origin's bus">
      {peers.map((peer) => (
        <span
          key={peer.id}
          className={[
            'peer',
            peer.kind === 'worker' ? 'peer--worker' : '',
            peer.id === self ? 'peer--self' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{ background: colorOf(peer.id) }}
          title={`${peer.id}${peer.id === self ? ' (this tab)' : ''} · ${peer.kind}`}
        />
      ))}
      <span>
        {peers.length} {peers.length === 1 ? 'tab' : 'tabs'}
      </span>
    </div>
  );
}

/**
 * The bar that makes the point before any page does: a live count of the tabs
 * on this origin, and a button to add one. Everything below it is a variation
 * on "and now they agree".
 */
function TopBar() {
  const [hint, setHint] = useState(false);

  // The hint is worth showing once and then never again — which is itself a
  // one-line demo of shared state, so it is one.
  useEffect(() => {
    const timer = setTimeout(() => setHint(true), 600);
    return () => clearTimeout(timer);
  }, []);

  return (
    <header className="top">
      <PeerStrip />
      {hint ? <span className="tag">open a second tab and watch</span> : null}
      <span className="top__spacer" />
      <ThemeToggle />
      <button type="button" className="primary" onClick={() => open(location.href, '_blank')}>
        Open another tab
      </button>
      <a
        className="tag"
        href="https://github.com/rxova/use-everywhere"
        target="_blank"
        rel="noreferrer"
      >
        GitHub
      </a>
      <a className="tag" href="https://rxova.org/packages/use-everywhere/">
        Docs
      </a>
    </header>
  );
}

function Sidebar({ current }: { current: string }) {
  return (
    <nav className="side">
      <a className="brand" href={hrefFor('shared-state')}>
        use-everywhere<span>( )</span>
        <small>every feature, live in your tabs</small>
      </a>
      {GROUPS.map((group) => (
        <div className="nav__group" key={group}>
          <div className="nav__h">{group}</div>
          {PAGES.filter((page) => page.group === group).map((page) => (
            <a
              key={page.slug}
              className="nav__link"
              href={hrefFor(page.slug)}
              aria-current={page.slug === current ? 'page' : undefined}
            >
              <span className="nav__dot" />
              {page.title}
            </a>
          ))}
        </div>
      ))}
    </nav>
  );
}

export function Shell({ current, children }: { current: string; children: ReactNode }) {
  return (
    <div className="app">
      <Sidebar current={current} />
      <div className="main">
        <TopBar />
        {children}
      </div>
    </div>
  );
}
