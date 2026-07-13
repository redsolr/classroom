"use server";

/**
 * Email + password login — pattern ported from Jurisimus web-app:
 * `authenticateWithPassword` → `saveSession` seals the tokens with
 * WORKOS_COOKIE_PASSWORD into the `wos-session` cookie. Always pass an
 * ABSOLUTE url to saveSession (see getRequestBaseUrl).
 */

import { saveSession } from "@workos-inc/authkit-nextjs";
import {
  clientId,
  getRequestBaseUrl,
  getWorkOS,
  getWorkOSErrorData,
  type AuthActionResult,
} from "@/lib/workos";

export async function emailPasswordLogin(
  formData: FormData,
): Promise<AuthActionResult> {
  const email = formData.get("email");
  const password = formData.get("password");

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email ||
    !password
  ) {
    return { error: "Email and password are required" };
  }

  try {
    const authResponse = await getWorkOS().userManagement.authenticateWithPassword(
      { clientId, email, password },
    );
    await saveSession(authResponse, `${await getRequestBaseUrl()}/login`);
    return {};
  } catch (err: unknown) {
    const { code, pendingAuthenticationToken } = getWorkOSErrorData(err);
    if (code === "email_verification_required" && pendingAuthenticationToken) {
      return { verify: { email, pendingAuthenticationToken } };
    }
    if (code === "sso_required") {
      return {
        error:
          "This email must sign in with its identity provider — use the Google or Apple button above.",
      };
    }

    console.error("[auth/login] authentication failed:", err);
    const message =
      err instanceof Error ? err.message : "Authentication failed";
    if (message.includes("invalid") || message.includes("credentials")) {
      return { error: "Invalid email or password" };
    }
    if (message.includes("not found")) {
      return { error: "No account found with this email" };
    }
    return { error: "Something went wrong. Please try again." };
  }
}
