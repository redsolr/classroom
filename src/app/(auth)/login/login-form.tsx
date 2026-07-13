"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AuthDivider,
  AuthField,
  AuthFooterLink,
  AuthSubmit,
  PasswordInput,
  SocialButton,
  ToggleSwitch,
} from "@/components/auth/auth-ui";
import { VerifyEmailForm } from "@/components/auth/verify-email-form";
import { emailPasswordLogin } from "./actions";

function validateEmail(email: string): string | null {
  if (!email) return "Email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Invalid email address";
  return null;
}

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<{
    email?: string;
    password?: string;
  }>({});
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
    setError("");
    startTransition(async () => {
      const result = await emailPasswordLogin(formData);
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
      <h1 className="auth-card-title mb-7">Sign in to your account</h1>

      <form action={handleSubmit} className="space-y-4">
        <AuthField label="Email" error={fieldErrors.email}>
          <input
            name="email"
            type="text"
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
