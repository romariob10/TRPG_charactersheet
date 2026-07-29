import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "../../tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  use: { baseURL, trace: "on-first-retry" },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "pnpm dev --port 3100", url: baseURL, reuseExistingServer: false },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
