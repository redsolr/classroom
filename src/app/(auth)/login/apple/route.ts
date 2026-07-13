/** Direct Apple OAuth — see google/route.ts for the pattern rationale. */
import { redirect } from "next/navigation";
import { clientId, getWorkOS, redirectUri } from "@/lib/workos";

export function GET() {
  const url = getWorkOS().userManagement.getAuthorizationUrl({
    provider: "AppleOAuth",
    clientId,
    redirectUri,
  });
  redirect(url);
}
