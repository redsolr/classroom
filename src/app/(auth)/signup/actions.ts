"use server";

/**
 * B2C signup — visible in the UI (unlike web-app's invite-only posture).
 * createUser → authenticateWithPassword → saveSession.
 *
 * Note: fixes web-app's latent bug of passing a bare "/signup" path to
 * saveSession (Secure cookie on plain-http localhost = silent logout).
 */

import { saveSession } from "@workos-inc/authkit-nextjs";
import {
  clientId,
  getRequestBaseUrl,
  getWorkOS,
  getWorkOSErrorData,
  type AuthActionResult,
} from "@/lib/workos";

export async function createAccount(
  formData: FormData,
): Promise<AuthActionResult> {
  const email = formData.get("email");
  const fullName = formData.get("fullName");
  const password = formData.get("password");

  if (
    typeof email !== "string" ||
    typeof fullName !== "string" ||
    typeof password !== "string" ||
    !email ||
    !fullName.trim() ||
    !password
  ) {
    return { error: "All fields are required" };
  }

  const [firstName, ...rest] = fullName.trim().split(" ");
  const lastName = rest.join(" ") || undefined;

  try {
    const workos = getWorkOS();
    await workos.userManagement.createUser({
      email,
      password,
      firstName,
      lastName,
    });

    const authResponse = await workos.userManagement.authenticateWithPassword({
      clientId,
      email,
      password,
    });
    await saveSession(authResponse, `${await getRequestBaseUrl()}/signup`);
    return {};
  } catch (err: unknown) {
    const { code, pendingAuthenticationToken } = getWorkOSErrorData(err);
    if (code === "email_verification_required" && pendingAuthenticationToken) {
      return { verify: { email, pendingAuthenticationToken } };
    }

    console.error("[auth/signup] failed to create account:", err);
    const message =
      err instanceof Error ? err.message : "Account creation failed";
    if (message.includes("already exists") || message.includes("duplicate")) {
      return { error: "An account with this email already exists" };
    }
    if (message.includes("password")) {
      return { error: "Password does not meet requirements (8+ characters)" };
    }
    return { error: "Something went wrong. Please try again." };
  }
}
