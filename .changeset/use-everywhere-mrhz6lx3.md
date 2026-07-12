---
'use-everywhere': minor
---

Add <Inspector /> on the new use-everywhere/devtools subpath: a floating panel showing this tab's peers, the leader, every store key with its version clock, and a live log of wires in both directions. It lives on a separate entry point, so it stays out of your bundle unless you import it, and it never creates a Leader — a devtool that enrolled your tab in an election it never asked to join would change the thing it measures. It reads the crown out of the wire log instead.
