import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    fileParallelism: false,
    include: [
      "tests/dashboard-app-shell.test.ts",
      "tests/dashboard-end-to-end.test.ts",
      "tests/end-to-end-parser-visible.test.ts",
      "tests/postgres-persistence.integration.test.ts",
    ],
  },
});
