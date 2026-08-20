import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Migration suites intentionally replay and roll back schema history. Keep
    // those DDL-heavy files isolated from each other even though their normal
    // application integration tests use independent schemas.
    fileParallelism: false,
  },
});
