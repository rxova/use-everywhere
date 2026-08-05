import { useState } from 'react';
import { createPortal } from 'react-dom';
import { DEFAULT_NAME } from '@use-everywhere/core';
import { Panel } from './panel.js';
import type { InspectorProps } from './inspector.types.js';
import { STYLES } from './styles.js';

/**
 * A floating panel showing what this tab is saying and hearing on the bus:
 * peers, the leader, store keys with their version clocks, a live wire log in
 * both directions, and a timeline of the state each wire produced.
 *
 * It deliberately does **not** create a Leader. Under dynamic eligibility,
 * mounting one with `eligible: false` would disable candidacy for the whole
 * tab, and mounting a plain one would enrol a tab that never asked to be a
 * candidate — a devtool must not change what it measures. Instead it reads the
 * crown out of the wire log, which it already sees in both directions.
 *
 * Presence is fine to use: the bus heartbeats regardless of whether anything
 * created a Presence, so usePeers observes rather than perturbs.
 *
 * **The panel lives in a shadow root.** Its styles used to be a `<style>` tag
 * in the page, which is only ever half true: `.ue-ins` could not leak out, but
 * everything in the host document leaked *in* — a `* { box-sizing }` reset, an
 * app-wide `button { text-transform: uppercase }`, a Tailwind preflight, any
 * `!important`. A devtool that renders differently depending on whose app it is
 * mounted in is a devtool you cannot trust when it looks wrong. Inside a shadow
 * root, page CSS does not apply and the panel's own CSS cannot escape.
 *
 * A consequence worth knowing when testing an app that mounts it: the panel is
 * **not** in `document`. Reach it through `host.shadowRoot`.
 */
export function Inspector({
  name = DEFAULT_NAME,
  position = 'bottom-right',
  limit = 50,
  defaultOpen = false,
  leaseMs = 3000,
}: InspectorProps = {}) {
  const [root, setRoot] = useState<ShadowRoot | null>(null);

  // A callback ref rather than an effect over a ref: this runs only when React
  // has an element, so there is no "the ref might be null" branch to write and
  // leave untested. `attachShadow` throws if one is already attached, which
  // StrictMode's double-invoked lifecycles make routine rather than exotic.
  const attach = (host: HTMLDivElement | null) => {
    if (!host || root) return;
    setRoot(host.shadowRoot ?? host.attachShadow({ mode: 'open' }));
  };

  return (
    <div ref={attach} data-testid="ue-inspector-host">
      {/*
       * Nothing renders until the shadow root exists, which means nothing
       * renders on the server. That is the right answer for a devtool — it has
       * no business in server HTML, and rendering it there only to move it
       * client-side would be a hydration mismatch in every app that ships it.
       */}
      {root
        ? createPortal(
            <>
              <style>{STYLES}</style>
              <Panel
                name={name}
                position={position}
                limit={limit}
                defaultOpen={defaultOpen}
                leaseMs={leaseMs}
              />
            </>,
            root,
          )
        : null}
    </div>
  );
}
