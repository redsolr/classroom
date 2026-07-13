"use client";

import * as React from "react";
import Link from "next/link";
import { AuthField, AuthFooterLink, AuthSubmit } from "@/components/auth/auth-ui";
import { sendPasswordReset } from "./actions";

export function ForgotPasswordForm() {
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState("");
  const [isPending, startTransition] = React.useTransition();

  if (sent) {
    return (
      <>
        <h1 className="auth-card-title">Check your email</h1>
        <p className="auth-card-subtitle mt-2 leading-relaxed">
          If an account exists with that address, we&rsquo;ve sent a password
          reset link.
        </p>
        <Link
          href="/login"
          className="auth-link mt-5 block text-[0.85rem] font-semibold"
        >
          Back to sign in
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="auth-card-title">Reset your password</h1>
      <p className="auth-card-subtitle mb-6 mt-1.5">
        We&rsquo;ll email you a reset link.
      </p>
      <form
        action={(fd) => {
          setError("");
          startTransition(async () => {
            const result = await sendPasswordReset(fd);
            if (result.error) {
              setError(result.error);
              return;
            }
            setSent(true);
          });
        }}
        className="space-y-4"
      >
        <AuthField label="Email" error={error || undefined}>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className={`auth-input ${error ? "auth-input-error" : ""}`}
          />
        </AuthField>
        <AuthSubmit
          label="Send reset link"
          pendingLabel="Sending..."
          isPending={isPending}
        />
      </form>
      <AuthFooterLink
        text="Remembered it after all?"
        linkText="Back to sign in"
        href="/login"
      />
    </>
  );
}
