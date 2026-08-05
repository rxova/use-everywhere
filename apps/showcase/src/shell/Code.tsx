import { useState } from 'react';

/**
 * The code beside every demo, and the same code that is running above it.
 *
 * No syntax highlighter: a highlighter is 40 kB and a build step to make
 * fifteen-line snippets prettier, on a page whose entire argument is that the
 * API is small enough to read.
 */
export function Code({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard?.writeText(children.trim()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <div className="code">
      <button type="button" className="ghost code__copy" onClick={copy}>
        {copied ? 'copied' : 'copy'}
      </button>
      <pre>{children.trim()}</pre>
    </div>
  );
}
