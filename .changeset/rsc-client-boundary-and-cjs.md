---
'use-everywhere': minor
---

Mark the React entry points with a `'use client'` banner so the hooks import directly into a Next.js App Router / React Server Components tree without the library tripping a "Server Component" error — you still call them from your own Client Component, but never see the error from inside the package. Adds a Next.js quickstart to the docs.

Also ship a CommonJS build alongside ESM (`require('use-everywhere')` now works, including the `use-everywhere/devtools` subpath), with per-condition types and an are-the-types-wrong-clean `exports` map.
