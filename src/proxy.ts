/**
 * Next.js 16 proxy — WorkOS AuthKit (pattern ported from Jurisimus web-app).
 *
 * `middlewareAuth.enabled` is FALSE by design, same rationale as web-app:
 * classroom now runs a fully CUSTOM login (`/login` + `/signup` + direct
 * Google/Apple via `getAuthorizationUrl`), never the hosted AuthKit screen.
 * `enabled: true` is the only thing that auto-redirects a protected path to
 * `getSignInUrl()` (the hosted screen), and authkit offers no way to point
 * that redirect at our own /login. So we disable it and enforce auth in the
 * app layer: `requireTeacher()` redirects unauthenticated requests to
 * /login on every protected page and server action. The proxy still runs
 * on every request for SESSION REFRESH + header injection.
 *
 * `unauthenticatedPaths` is retained as living documentation of the public
 * surface (and a one-flip re-enable) but is INERT while `enabled: false`.
 *
 * Under `MOCK_AUTH=true` (set by `npm run dev:mock`) the proxy is a
 * pass-through and `requireTeacher()` returns a canned dev teacher —
 * local dev needs zero WorkOS keys.
 */

import { authkitProxy } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { MOCK_AUTH_ENABLED } from "@/lib/mock-auth";

const mockProxy = () => NextResponse.next();

// Fail loudly with an ACTIONABLE message when real-auth mode is started
// without WorkOS configured — authkit's own error ("You must provide a
// valid cookie password…") doesn't say how to fix it.
const missingWorkOSVars = [
  "WORKOS_API_KEY",
  "WORKOS_CLIENT_ID",
  "WORKOS_COOKIE_PASSWORD",
  "NEXT_PUBLIC_WORKOS_REDIRECT_URI",
].filter((key) => !process.env[key]);
if (
  missingWorkOSVars.length === 0 &&
  (process.env.WORKOS_COOKIE_PASSWORD?.length ?? 0) < 32
) {
  missingWorkOSVars.push("WORKOS_COOKIE_PASSWORD (must be 32+ chars)");
}

const misconfiguredProxy = () => {
  throw new Error(
    `WorkOS auth is not configured — missing/invalid: ${missingWorkOSVars.join(", ")}. ` +
      "Fill these in .env.local (see .env.example; generate a cookie password with " +
      "`openssl rand -base64 32`), or run `npm run dev:mock` for keyless local development.",
  );
};

export default MOCK_AUTH_ENABLED
  ? mockProxy
  : missingWorkOSVars.length > 0
  ? misconfiguredProxy
  : authkitProxy({
      middlewareAuth: {
        enabled: false,
        unauthenticatedPaths: [
          "/",
          "/login",
          "/login/google",
          "/login/apple",
          "/signup",
          "/forgot-password",
          "/callback",
          "/logout",
          // Public student recap — the token in the path is the sole
          // authorization; the page exposes only approved content.
          "/r/:path*",
          // Persistent student portal — same token-in-path model,
          // revocable per student (regenerate/disable).
          "/p/:path*",
          // A learner's SHARED BOOK — same model again: the token in the
          // path is the sole authorization, the page is read-only, and
          // the query behind it returns a fixed shape rather than a row,
          // so a column added later cannot leak by being added.
          "/b/:path*",
          // Session-refresh bounce (see src/app/auth/refresh/route.ts).
          "/auth/refresh",
        ],
      },
    });

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
