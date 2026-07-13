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

export default process.env.MOCK_AUTH === "true"
  ? mockProxy
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
