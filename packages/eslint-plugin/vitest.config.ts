import { baseVitestConfig } from "@rxova/repo-config/vitest";

// `src/__tests__/` holds the suites and the helpers they share; none of it ships.
export default baseVitestConfig({ root: import.meta.dirname, exclude: ["src/__tests__/**"] });
