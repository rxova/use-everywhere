---
'use-everywhere': minor
---

Add defineStore(name, { persist }): bind a store name and its persistence once at module level and get typed useSharedState back, plus get() for non-React code. It resolves to the same store singleton a bare useSharedState({ store: name }) reaches, so both get persistence. Running it after that store already exists throws rather than quietly handing back an unpersisted store.
