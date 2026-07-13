"use server";

/**
 * Email-verification step for password signup/login. The WorkOS
 * environment requires verified email ownership before password auth
 * completes: `authenticateWithPassword` throws
 * `email_verification_required` with a pending token, WorkOS emails a
 * 6-digit code, and this action redeems it.
 */

import { saveSession } from "@workos-inc/authkit-nextjs";
import { clientId, getRequestBaseUrl, getWorkOS } from "@/lib/workos";

export async function verifyEmailCode(
  pendingAuthenticationToken: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const code = formData.get("code");
  if (typeof code !== "string" || !code.trim()) {
    return { error: "Enter the code from your email" };
  }

  try {
    const authResponse =
      await getWorkOS().userManagement.authenticateWithEmailVerification({
        clientId,
        code: code.trim(),
        pendingAuthenticationToken,
      });
    await saveSession(authResponse, `${await getRequestBaseUrl()}/signup`);
    return {};
  } catch (err) {
    console.error("[auth/verify-email] verification failed:", err);
    return { error: "That code didn't work. Check the email and try again." };
  }
}
