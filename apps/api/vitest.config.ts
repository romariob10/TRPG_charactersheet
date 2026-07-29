import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Each integration suite creates and migrates its own PostgreSQL schema.
    // Running those migrations in parallel makes schema setup flaky while
    // still providing no useful application-level concurrency coverage.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@mycharacter/contracts": path.resolve(
        __dirname,
        "../../packages/contracts/src/index.ts",
      ),
      "@mycharacter/database": path.resolve(
        __dirname,
        "../../packages/database/src/index.ts",
      ),
    },
  },
});
