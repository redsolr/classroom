"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AuthDivider,
  AuthField,
  AuthFooterLink,
  AuthSubmit,
  PasswordInput,
  SocialButton,
} from "@/components/auth/auth-ui";
import { VerifyEmailForm } from "@/components/auth/verify-email-form";
import { createAccount } from "./actions";

export function SignupForm() {
  const router = useRouter();
  const [error, setError] = React.useState("");
  const [verify, setVerify] = React.useState<{
    email: string;
    pendingAuthenticationToken: string;
  } | null>(null);
  const [isPending, startTransition] = React.useTransition();

  if (verify) {
    return (
      <VerifyEmailForm
        email={verify.email}
        pendingAuthenticationToken={verify.pendingAuthenticationToken}
      />
    );
  }

  function handleSubmit(formData: FormData) {
    setError("");
    startTransition(async () => {
      const result = await createAccount(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.verify) {
        setVerify(result.verify);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <>
      <h1 className="auth-card-title">Create your class-room</h1>
      <p className="auth-card-subtitle mb-6 mt-1.5">
        Free while in early access — remember every student from day one.
      </p>

      <form action={handleSubmit} className="space-y-4">
        <AuthField label="Full name">
          <input
            name="fullName"
            required
            autoComplete="name"
            className="auth-input"
          />
        </AuthField>
        <AuthField label="Email">
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="auth-input"
          />
        </AuthField>
        <PasswordInput
          name="password"
          autoComplete="new-password"
          error={error || undefined}
        />

        <AuthSubmit
          label="Create account"
          pendingLabel="Creating account..."
          isPending={isPending}
        />
      </form>

      <AuthDivider />

      <div className="space-y-3">
        <SocialButton provider="google" action="Sign up" />
        <SocialButton provider="apple" action="Sign up" />
      </div>

      <AuthFooterLink
        text="Already have an account?"
        linkText="Sign in"
        href="/login"
      />
    </>
  );
}
