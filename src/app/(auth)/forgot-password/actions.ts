"use server";

import { getWorkOS } from "@/lib/workos";

export async function sendPasswordReset(
  formData: FormData,
): Promise<{ error?: string }> {
  const email = formData.get("email");
  if (typeof email !== "string" || !email) {
    return { error: "Email is required" };
  }

  try {
    await getWorkOS().userManagement.createPasswordReset({ email });
    return {};
  } catch (err) {
    // Always report success to avoid email enumeration — log for ops.
    console.warn(
      "[auth/forgot-password] createPasswordReset failed (hidden from user to prevent enumeration):",
      err,
    );
    return {};
  }
}
