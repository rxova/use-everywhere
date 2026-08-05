import { useEffect } from 'react';
import { Shell } from './shell/Shell.js';
import { pageFor } from './shell/pages.js';
import { useRoute } from './router.js';

export function App() {
  const route = useRoute();
  const page = pageFor(route);
  const Current = page.Component;

  // The tab title says where you are, which matters more here than usually:
  // half the point of this app is having several of it open at once.
  useEffect(() => {
    document.title = `${page.title} · use-everywhere`;
  }, [page.title]);

  // A hash route lands mid-page when the previous one was scrolled.
  useEffect(() => {
    scrollTo({ top: 0 });
  }, [route]);

  return (
    <Shell current={page.slug}>
      <Current />
    </Shell>
  );
}
