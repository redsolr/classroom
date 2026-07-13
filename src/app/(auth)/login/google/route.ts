/**
 * Direct Google OAuth — straight to Google, no WorkOS hosted page.
 * Uses `getAuthorizationUrl` (not `getSignInUrl`); the custom /callback
 * pairs with it via `authenticateWithCode` + `saveSession`.
 */
import { redirect } from "next/navigation";
import { clientId, getWorkOS, redirectUri } from "@/lib/workos";

export function GET() {
  const url = getWorkOS().userManagement.getAuthorizationUrl({
    provider: "GoogleOAuth",
    clientId,
    redirectUri,
  });
  redirect(url);
}
