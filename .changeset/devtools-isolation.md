---
'use-everywhere': minor
---

The Inspector now renders inside a shadow root, so the host page's CSS cannot reach it (its own styles already could not leak out — that was only half the problem). It also gains per-scope views over the wire log and a timeline: every state wire records a frame, and **restore** writes one back through the store so every tab converges rather than one tab disagreeing quietly.

Two behaviour changes worth knowing: the panel is no longer in `document` — reach it through `host.shadowRoot` if your tests assert on it — and it renders nothing during server rendering, where it previously emitted markup no one could use. `react-dom` is now an optional peer dependency, used for the portal.
