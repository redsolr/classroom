/**
 * WorkOS helpers for the custom auth flow (ported from Jurisimus web-app).
 * `getWorkOS()` is authkit-nextjs's lazily-initialized client — reusing it
 * avoids a direct @workos-inc/node dependency.
 */
import { headers } from "next/headers";

export { getWorkOS } from "@workos-inc/authkit-nextjs";

export const clientId = process.env.WORKOS_CLIENT_ID!;
export const redirectUri = process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI!;

/** Result shape shared by every credential auth action (login, signup,
 *  verify): an error to display, or a pending email-verification step. */
export type AuthActionResult = {
  error?: string;
  verify?: { email: string; pendingAuthenticationToken: string };
};

/**
 * Absolute URL for the current request, from forwarded headers.
 *
 * Gotcha carried over from web-app: `saveSession(authResponse, <url>)`
 * calls `new URL(<url>)` internally to decide whether to set `Secure` on
 * the session cookie. A bare pathname throws inside authkit and the catch
 * defaults to `Secure=true` — invisible to the browser over plain
 * `http://localhost`, silently logging you out. ALWAYS pass an absolute
 * URL built from this helper, never a bare path.
 */
/**
 * Extract the structured error data WorkOS attaches to auth failures —
 * notably `email_verification_required` with its pending token.
 */
export function getWorkOSErrorData(err: unknown): {
  code?: string;
  pendingAuthenticationToken?: string;
} {
  if (typeof err !== "object" || err === null) return {};
  const anyErr = err as Record<string, unknown> & {
    rawData?: Record<string, unknown>;
  };
  const raw = anyErr.rawData ?? anyErr;
  return {
    code: (raw.code ?? anyErr.code) as string | undefined,
    pendingAuthenticationToken: (raw.pending_authentication_token ??
      raw.pendingAuthenticationToken ??
      anyErr.pendingAuthenticationToken) as string | undefined,
  };
}

export async function getRequestBaseUrl(): Promise<string> {
  const hdrs = await headers();
  const host =
    hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3020";
  const forwardedProto = hdrs.get("x-forwarded-proto");
  const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const proto = forwardedProto ?? (isLocal ? "http" : "https");
  return `${proto}://${host}`;
}
