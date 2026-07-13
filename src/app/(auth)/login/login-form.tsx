"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { OAuthButtons, OrDivider } from "@/components/auth/oauth-buttons";
import { VerifyEmailForm } from "@/components/auth/verify-email-form";
import { emailPasswordLogin } from "./actions";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [verify, setVerify] = React.useState<{
    email: string;
    pendingAuthenticationToken: string;
  } | null>(null);
  const [pending, startTransition] = React.useTransition();

  if (verify) {
    return (
      <VerifyEmailForm
        email={verify.email}
        pendingAuthenticationToken={verify.pendingAuthenticationToken}
      />
    );
  }

  return (
    <div>
      <h1 className="text-[1.05rem] font-semibold">Welcome back</h1>
      <p className="mb-5 mt-1 text-[0.8rem] text-fg-secondary">
        Sign in to your class-room.
      </p>

      <OAuthButtons />
      <OrDivider />

      <form
        action={(fd) => {
          setError(null);
          startTransition(async () => {
            const result = await emailPasswordLogin(fd);
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
        }}
        className="space-y-3"
      >
        <Field label="Email">
          <Input name="email" type="email" required autoComplete="email" />
        </Field>
        <Field label="Password">
          <Input
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </Field>
        {error && <p className="text-[0.8rem] text-danger">{error}</p>}
        <Button
          type="submit"
          variant="primary"
          loading={pending}
          className="w-full"
        >
          Sign in
        </Button>
      </form>

      <div className="mt-4 flex items-center justify-between text-[0.78rem]">
        <Link
          href="/forgot-password"
          className="text-fg-secondary hover:text-fg hover:underline"
        >
          Forgot password?
        </Link>
        <Link
          href="/signup"
          className="font-medium text-accent-text hover:underline"
        >
          Create an account
        </Link>
      </div>
    </div>
  );
}
