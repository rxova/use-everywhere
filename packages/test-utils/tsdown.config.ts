import { defineConfig } from "tsdown";
import { baseBuildConfig } from "@rxova/repo-config/tsdown";

export default defineConfig(
  baseBuildConfig({
    // The shared preset is ESM-only for Node 22. These packages also serve
    // `require()` from their exports maps and run in browsers.
    format: ["esm", "cjs"],
    target: "es2020",
    // Peer-ish: the library under test must be the same instance the test
    // imports, or the registry singletons would not line up.
    external: ["@use-everywhere/core"],
  }),
);
