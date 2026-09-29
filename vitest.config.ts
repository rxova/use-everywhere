import { baseVitestConfig } from "@rxova/repo-config/vitest";

// The repository's own scripts and the repo-wide error-codes test.
export default baseVitestConfig({
  root: import.meta.dirname,
  include: ["scripts/**/*.test.ts"],
  coverageInclude: ["scripts/**/*.ts"],
  exclude: ["scripts/**/*.test.ts"],
  reporter: ["text", "json-summary"],
});
