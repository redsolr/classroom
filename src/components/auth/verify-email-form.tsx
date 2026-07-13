"use client";

import { AuthField, AuthSubmit } from "@/components/auth/auth-ui";
import { useAuthForm } from "@/components/auth/use-auth-form";
import { verifyEmailCode } from "@/app/(auth)/verify-email/actions";

/** Code-entry step shown when WorkOS requires email verification. */
export function VerifyEmailForm({
  email,
  pendingAuthenticationToken,
}: {
  email: string;
  pendingAuthenticationToken: string;
}) {
  const { error, isPending, submit } = useAuthForm();

  return (
    <>
      <h1 className="auth-card-title">Check your email</h1>
      <p className="auth-card-subtitle mb-6 mt-1.5 leading-relaxed">
        We sent a 6-digit code to{" "}
        <span className="auth-strong">{email}</span>. Enter it below to verify
        your address.
      </p>
      <form
        action={(fd) =>
          submit((formData) => verifyEmailCode(pendingAuthenticationToken, formData), fd)
        }
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
