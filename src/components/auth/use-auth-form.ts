"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { AuthActionResult } from "@/lib/workos";

/**
 * Shared plumbing for every auth form: pending transition, error state,
 * the email-verification branch, and the post-success navigation.
 */
export function useAuthForm() {
  const router = useRouter();
  const [error, setError] = React.useState("");
  const [verify, setVerify] = React.useState<{
    email: string;
    pendingAuthenticationToken: string;
  } | null>(null);
  const [isPending, startTransition] = React.useTransition();

  function submit(
    action: (formData: FormData) => Promise<AuthActionResult>,
    formData: FormData,
    options?: { onSuccess?: () => void },
  ) {
    setError("");
    startTransition(async () => {
      const result = await action(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.verify) {
        setVerify(result.verify);
        return;
      }
      if (options?.onSuccess) {
        options.onSuccess();
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  return { error, setError, verify, isPending, submit };
}
