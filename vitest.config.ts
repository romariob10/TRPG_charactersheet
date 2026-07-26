import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    exclude: [
      "tests/e2e/**",
      ".worktrees/**",
      "node_modules/**",
      ".next/**",
    ],
    coverage: { reporter: ["text", "json", "html"], include: ["src/lib/**/*.ts"] },
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
