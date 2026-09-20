---
'@use-everywhere/core': patch
---

Drop `export` from `validate` and `StandardSchemaResult`, which nothing imported. The published API is unchanged — neither was re-exported from `src/index.ts`, and `StandardSchemaV1` still declares its result shape inline in the emitted types.
