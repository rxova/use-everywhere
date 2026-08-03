---
'@use-everywhere/core': patch
---

Give `StorageTransport` a useful error where there is no `localStorage`.

The default parameter referenced the bare global, so constructing one in a worker threw `ReferenceError: localStorage is not defined` — accurate and useless. `defaultTransport` never reaches that path because it probes first, but the class is exported, so a direct caller now gets told that workers have neither `localStorage` nor the storage event, and to use `BroadcastChannel` there.
