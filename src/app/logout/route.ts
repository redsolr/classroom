import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { getWorkOS } from "@/lib/workos";

/**
 * Logout — back-channel session revocation + local cookie clear.
 *
 * We deliberately do NOT use authkit's `signOut()`: it bounces the browser
 * through WorkOS's hosted logout, whose final redirect only honors
 * `returnTo` if it's on the environment's logout-redirect allowlist —
 * otherwise it falls back to the environment default (web-app's
 * localhost:3000 in the shared Jurisimus test env). Revoking the session
 * server-side and deleting the cookie is equivalent and has no allowlist
 * dependency.
 */
export async function GET() {
  if (process.env.MOCK_AUTH === "true") {
    redirect("/");
  }

  const { sessionId } = await withAuth();
  if (sessionId) {
    try {
      await getWorkOS().userManagement.revokeSession({ sessionId });
    } catch (err) {
      // Cookie deletion below still signs the browser out locally.
      console.error("[auth/logout] session revocation failed:", err);
    }
  }

  const cookieStore = await cookies();
  cookieStore.delete(process.env.WORKOS_COOKIE_NAME ?? "wos-session");
  redirect("/");
}
