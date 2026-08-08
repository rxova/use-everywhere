/**
 * Prefixes a site-root-relative URL with the site's `base`.
 *
 * Astro emits a root-relative URL verbatim, so under the rxova.org aggregator
 * (DOCS_BASE_URL=/packages/use-everywhere/) a link written as `/hooks/inspector`
 * points one directory above where the docs are mounted. Everything that writes
 * links for the agent-facing surfaces goes through here.
 *
 * Left alone: protocol-relative (`//host`) and absolute URLs, fragments, and
 * anything already carrying the base — so applying it twice is a no-op.
 */
export function withBase(url, base = '/') {
  const prefix = base.replace(/\/+$/, '');
  if (!prefix || typeof url !== 'string') return url;
  if (!url.startsWith('/') || url.startsWith('//')) return url;
  if (url === prefix || url.startsWith(`${prefix}/`)) return url;
  return prefix + url;
}
