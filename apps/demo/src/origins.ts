/**
 * Cross-origin without any extra config: one Vite server, reached via two
 * hostnames. localhost:5173 and 127.0.0.1:5173 are different origins, so the
 * payment window genuinely exercises the cross-origin postMessage path.
 * Works no matter which side the user opened first.
 */
export function otherOrigin(): string {
  const { protocol, hostname, port } = location;
  const otherHost = hostname === '127.0.0.1' ? 'localhost' : '127.0.0.1';
  return `${protocol}//${otherHost}${port ? `:${port}` : ''}`;
}

/** Stable color per client id, shared by all presence/patch-log UI. */
export function colorOf(id: string): string {
  const hue = [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return `hsl(${hue} 55% 45%)`;
}
