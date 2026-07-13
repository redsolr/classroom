/**
 * Next.js 16 proxy — WorkOS AuthKit (pattern lifted from Jurisimus web-app).
 *
 * Difference from web-app: class-room has no separate API backend doing
 * cookie enforcement and no custom login screen, so `middlewareAuth` is
 * ENABLED — unauthenticated visits to protected paths redirect to the
 * hosted AuthKit sign-in screen (WorkOS's current recommended flow).
 *
 * Under `MOCK_AUTH=true` (server-only env var, set by `npm run dev:mock`)
 * the proxy is a pass-through and `requireTeacher()` returns a canned dev
 * teacher — local dev needs zero WorkOS keys.
 */

import { authkitProxy } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";

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

export default process.env.MOCK_AUTH === "true"
  ? mockProxy
  : missingWorkOSVars.length > 0
  ? misconfiguredProxy
  : authkitProxy({
      middlewareAuth: {
        enabled: true,
        unauthenticatedPaths: [
          "/",
          "/login",
          "/callback",
          "/logout",
          // Public student recap — the token in the path is the sole
          // authorization; the page exposes only approved content.
          "/r/:path*",
        ],
      },
    });

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
