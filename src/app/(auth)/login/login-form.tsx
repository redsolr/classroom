"use client";

import * as React from "react";
import Link from "next/link";
import {
  AuthDivider,
  AuthField,
  AuthFooterLink,
  AuthSubmit,
  PasswordInput,
  SocialButton,
  ToggleSwitch,
} from "@/components/auth/auth-ui";
import { useAuthForm } from "@/components/auth/use-auth-form";
import { VerifyEmailForm } from "@/components/auth/verify-email-form";
import { emailPasswordLogin } from "./actions";

function validateEmail(email: string): string | null {
  if (!email) return "Email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Invalid email address";
  return null;
}

export function LoginForm() {
  const { error, setError, verify, isPending, submit } = useAuthForm();
  const [fieldErrors, setFieldErrors] = React.useState<{
    email?: string;
    password?: string;
  }>({});

  if (verify) {
    return (
      <VerifyEmailForm
        email={verify.email}
        pendingAuthenticationToken={verify.pendingAuthenticationToken}
      />
    );
  }

  function handleSubmit(formData: FormData) {
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const errors: { email?: string; password?: string } = {};
    const emailErr = validateEmail(email);
    if (emailErr) errors.email = emailErr;
    if (!password) errors.password = "Password is required";
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError("");
      return;
    }
    setFieldErrors({});
    submit(emailPasswordLogin, formData);
  }

  return (
    <>
      <h1 className="auth-card-title mb-7">Sign in to your account</h1>

      {/* noValidate: our JS validation is the single validator — the
          browser's native email tooltip would race it. type="email" is
          kept for semantics, autofill, and mobile keyboards. */}
      <form action={handleSubmit} className="space-y-4" noValidate>
        <AuthField label="Email" error={fieldErrors.email}>
          <input
            name="email"
            type="email"
            autoComplete="email"
            className={`auth-input ${fieldErrors.email ? "auth-input-error" : ""}`}
          />
        </AuthField>

        <PasswordInput
          name="password"
          autoComplete="current-password"
          error={fieldErrors.password || error || undefined}
          rightLabel={
            <Link
              href="/forgot-password"
              className="auth-link text-[13px] font-semibold"
            >
              Forgot your password?
            </Link>
          }
        />

        <ToggleSwitch
          name="remember"
          defaultChecked
          label="Remember me on this device"
        />

        <AuthSubmit
          label="Sign in"
          pendingLabel="Signing in..."
          isPending={isPending}
        />
      </form>

      <AuthDivider />

      <div className="space-y-3">
        <SocialButton provider="google" />
        <SocialButton provider="apple" />
      </div>

      <AuthFooterLink
        text="New to Class-room?"
        linkText="Create a free account"
        href="/signup"
      />
    </>
  );
}
