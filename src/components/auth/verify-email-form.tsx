"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AuthField, AuthSubmit } from "@/components/auth/auth-ui";
import { verifyEmailCode } from "@/app/(auth)/verify-email/actions";

/** Code-entry step shown when WorkOS requires email verification. */
export function VerifyEmailForm({
  email,
  pendingAuthenticationToken,
}: {
  email: string;
  pendingAuthenticationToken: string;
}) {
  const router = useRouter();
  const [error, setError] = React.useState("");
  const [isPending, startTransition] = React.useTransition();

  return (
    <>
      <h1 className="auth-card-title">Check your email</h1>
      <p className="auth-card-subtitle mb-6 mt-1.5 leading-relaxed">
        We sent a 6-digit code to{" "}
        <span className="auth-strong">{email}</span>. Enter it below to verify
        your address.
      </p>
      <form
        action={(fd) => {
          setError("");
          startTransition(async () => {
            const result = await verifyEmailCode(
              pendingAuthenticationToken,
              fd,
            );
            if (result.error) {
              setError(result.error);
              return;
            }
            router.push("/dashboard");
            router.refresh();
          });
        }}
        className="space-y-4"
      >
        <AuthField label="Verification code" error={error || undefined}>
          <input
            name="code"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            className={`auth-input text-center font-mono tracking-[0.3em] ${error ? "auth-input-error" : ""}`}
          />
        </AuthField>
        <AuthSubmit
          label="Verify and continue"
          pendingLabel="Verifying..."
          isPending={isPending}
        />
      </form>
    </>
  );
}
