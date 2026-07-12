---
'@use-everywhere/core': minor
---

Add opt-in persistence. createSharedStore accepts a persist option; localStorageAdapter, sessionStorageAdapter, and webStorageAdapter store the state together with its version clocks, so a reopened tab re-enters the last-writer-wins race with its real term rather than a fresh zero. A restored value beats a staler live tab and loses to a newer one, and either way all tabs converge. Blocked storage, corrupt JSON, and a full quota degrade to a silent no-op. Stores also expose getVersions().
