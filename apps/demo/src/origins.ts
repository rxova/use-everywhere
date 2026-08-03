/**
 * Cross-origin without any extra config: one Vite server, reached via two
 * hostnames. localhost:5173 and 127.0.0.1:5173 are different origins, so the
 * payment window genuinely exercises the cross-origin postMessage path.
 *
 * Each entry pairs with its partner, because *both* sides compute this: the
 * child names the opener's origin as its `peerOrigin`, and a mapping that is
 * not an involution makes the child reject the opener at the origin gate.
 *
 * The 127.0.0.2/3 pair exists for the e2e suite. `localhost` is not dependable
 * under test: it resolves to ::1 before 127.0.0.1 on some hosts (GitHub's
 * runners among them), and a dev server bound to one address family refuses
 * connections on the other — which surfaced as the payment popup loading a
 * dead page in CI while passing locally. Two plain IPv4 loopback addresses
 * take DNS and IPv6 out of the question.
 */
const ORIGIN_PAIRS: Record<string, string> = {
  localhost: '127.0.0.1',
  '127.0.0.1': 'localhost',
  '127.0.0.2': '127.0.0.3',
  '127.0.0.3': '127.0.0.2',
};

export function otherOrigin(): string {
  const { protocol, hostname, port } = location;
  const otherHost = ORIGIN_PAIRS[hostname] ?? '127.0.0.1';
  return `${protocol}//${otherHost}${port ? `:${port}` : ''}`;
}

/** Stable color per client id, shared by all presence/patch-log UI. */
export function colorOf(id: string): string {
  const hue = [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return `hsl(${hue} 55% 45%)`;
}
