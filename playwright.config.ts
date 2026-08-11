import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * Two-tier e2e suite, same shape as the crm repo:
 *
 *   mocked (default)   `npm run test:e2e` — dev server in MOCK_AUTH mode,
 *                      real local Postgres. Covers the product loop.
 *   real-auth          `npm run test:e2e:real-auth` — dev server with REAL
 *                      WorkOS auth, no mocks anywhere. The only tier that
 *                      can honestly assert "anonymous is rejected" — under
 *                      MOCK_AUTH that claim is structurally untestable
 *                      (the CRM's 9-day /api hole, 2026-08-08).
 *
 * Both run single-worker against the persistent local Postgres
 * (docker compose up -d + db:migrate must have run).
 */
const REAL_AUTH = process.env.E2E_MODE === "real-auth";

/**
 * Playwright never loads .env.local (Next and tsx do) — the real-auth
 * specs need E2E_TEACHER_* and DATABASE_URL in-process. Dependency-free
 * parse; real env vars win over file values.
 */
function loadEnvLocal(): void {
  let raw: string;
  try {
    raw = readFileSync(join(__dirname, ".env.local"), "utf8");
  } catch {
    return; // CI supplies real env vars instead
  }
  for (const line of raw.replace(/^﻿/, "").split(/\r?\n/)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line.trim());
    if (!match) continue;
    const [, key, value] = match;
    if (process.env[key] === undefined) {
      process.env[key] = value.replace(/^["']|["']$/g, "");
    }
  }
}

if (REAL_AUTH) loadEnvLocal();

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
  projects: REAL_AUTH
    ? [{ name: "real-auth", testMatch: /.*\.real-auth\.spec\.ts/ }]
    : [{ name: "mocked", testIgnore: /.*\.real-auth\.spec\.ts/ }],
  webServer: {
    command: REAL_AUTH ? "npm run dev" : "npm run dev:mock",
    url: "http://localhost:3020",
    reuseExistingServer: false,
    timeout: 120_000,
    // Deterministic free-tier gate for study.spec.ts (merged over
    // process.env). The real-auth tier keeps production-shaped defaults.
    //
    // The mocked tier also FORCE-EMPTIES every paid-provider key: Next
    // never overrides a var that already exists in process.env (even
    // empty), so this beats .env.local — a founder key sitting there must
    // never make `npm run test:e2e` burn real LLM/Stripe calls or break
    // the mock-reply assertions.
    env: REAL_AUTH
      ? {}
      : {
          STUDY_FREE_DAILY_CAP: "10",
          OPENAI_API_KEY: "",
          ANTHROPIC_API_KEY: "",
          STRIPE_SECRET_KEY: "",
          STRIPE_WEBHOOK_SECRET: "",
          STRIPE_STUDY_PRICE_ID: "",
        },
  },
});
