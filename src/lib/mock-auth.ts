/**
 * The MOCK_AUTH escape hatch — and the production weld on it.
 *
 * `MOCK_AUTH=true` (set by `npm run dev:mock`, and by the Playwright
 * suite) makes `proxy.ts` a pass-through and `resolveAccount()` return a
 * canned teacher with NO session at all. That is exactly right for
 * keyless local development and exactly catastrophic on a deployed
 * environment: a single stray env var would hand every anonymous caller
 * a fully-privileged teacher account.
 *
 * So the hatch is honored ONLY outside a production build. `next dev`
 * sets NODE_ENV=development, so `dev:mock` and the e2e suite are
 * unaffected; `next build` / `next start` set production, where the flag
 * is inert no matter what the environment says. The CRM closed the same
 * gap on 2026-08-08 (`crm/src/server/api-auth.ts` — MOCK_AUTH honored
 * only outside a production build); this is that rule, applied here
 * before it could bite.
 *
 * Deliberately dependency-free: `proxy.ts` imports it, and pulling the
 * db/drizzle graph into the proxy bundle would be a regression.
 */

const MOCK_AUTH_REQUESTED = process.env.MOCK_AUTH === "true";
const IS_PRODUCTION_BUILD = process.env.NODE_ENV === "production";

export const MOCK_AUTH_ENABLED = MOCK_AUTH_REQUESTED && !IS_PRODUCTION_BUILD;

// Ignoring the flag is the safe behavior, but silence would hide a real
// misconfiguration — say so once, loudly enough to show up in the host's
// logs, without taking the app down over an env var.
if (MOCK_AUTH_REQUESTED && IS_PRODUCTION_BUILD) {
  console.warn(
    "[auth] MOCK_AUTH=true is set on a PRODUCTION build and is being IGNORED. " +
      "Real WorkOS authentication is enforced. Remove MOCK_AUTH from this " +
      "environment — it is a local-development-only flag.",
  );
}
