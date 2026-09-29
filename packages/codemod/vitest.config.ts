import { baseVitestConfig } from "@rxova/repo-config/vitest";

export default baseVitestConfig({
  root: import.meta.dirname,
  // `cli.ts` is the process entry: it reads argv and exits, which is exactly
  // what a unit test cannot run in-process. `main.ts` behind it is tested.
  exclude: ["src/cli.ts", "src/__tests__/**"],
});
