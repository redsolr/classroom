"use client";

import {
  AuthDivider,
  AuthField,
  AuthFooterLink,
  AuthSubmit,
  PasswordInput,
  SocialButton,
} from "@/components/auth/auth-ui";
import { useAuthForm } from "@/components/auth/use-auth-form";
import { VerifyEmailForm } from "@/components/auth/verify-email-form";
import { createAccount } from "./actions";

export function SignupForm() {
  const { error, verify, isPending, submit } = useAuthForm();

  if (verify) {
    return (
      <VerifyEmailForm
        email={verify.email}
        pendingAuthenticationToken={verify.pendingAuthenticationToken}
      />
    );
  }

  return (
    <>
      <h1 className="auth-card-title">Create your class-room</h1>
      <p className="auth-card-subtitle mb-6 mt-1.5">
        Free while in early access — remember every student from day one.
      </p>

      <form action={(fd) => submit(createAccount, fd)} className="space-y-4">
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
