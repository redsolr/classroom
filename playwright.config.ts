import { defineConfig, devices } from "@playwright/test";

/**
 * E2E suite — runs against the real dev server in MOCK_AUTH mode with the
 * real local Postgres (docker compose up -d + db:migrate must have run).
 * Single worker: all tests share the one mock teacher.
 */
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3020",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "npm run dev:mock",
    url: "http://localhost:3020",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
