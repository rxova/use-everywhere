import type { ComponentType } from 'react';
import { SharedStatePage } from '../pages/shared-state.js';
import { ConflictsPage } from '../pages/conflicts.js';
import { MessagesPage } from '../pages/messages.js';
import { PresencePage } from '../pages/presence.js';
import { LeadershipPage } from '../pages/leadership.js';
import { ReducerPage } from '../pages/reducer.js';
import { PersistencePage } from '../pages/persistence.js';
import { NamespacesPage } from '../pages/namespaces.js';
import { TransportsPage } from '../pages/transports.js';
import { DevtoolsPage } from '../pages/devtools.js';

export interface PageDef {
  slug: string;
  title: string;
  group: string;
  Component: ComponentType;
}

/**
 * Ordered the way someone meets the library: the two things every app needs
 * first, then the coordination primitives, then the parts you reach for once
 * it is load-bearing.
 */
export const PAGES: readonly PageDef[] = [
  { slug: 'shared-state', title: 'Shared state', group: 'State', Component: SharedStatePage },
  { slug: 'conflicts', title: 'Conflicts & clocks', group: 'State', Component: ConflictsPage },
  { slug: 'reducer', title: 'Counters that add up', group: 'State', Component: ReducerPage },
  { slug: 'persistence', title: 'Persistence', group: 'State', Component: PersistencePage },
  { slug: 'messages', title: 'Messages & ask', group: 'Coordination', Component: MessagesPage },
  { slug: 'presence', title: 'Presence', group: 'Coordination', Component: PresencePage },
  { slug: 'leadership', title: 'Leadership', group: 'Coordination', Component: LeadershipPage },
  { slug: 'namespaces', title: 'Namespaces', group: 'In the large', Component: NamespacesPage },
  { slug: 'transports', title: 'Transports', group: 'In the large', Component: TransportsPage },
  { slug: 'devtools', title: 'Devtools', group: 'In the large', Component: DevtoolsPage },
];

export const GROUPS = [...new Set(PAGES.map((page) => page.group))];

export const pageFor = (slug: string): PageDef => PAGES.find((p) => p.slug === slug) ?? PAGES[0]!;
