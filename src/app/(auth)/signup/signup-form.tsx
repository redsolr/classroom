"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { OAuthButtons, OrDivider } from "@/components/auth/oauth-buttons";
import { VerifyEmailForm } from "@/components/auth/verify-email-form";
import { createAccount } from "./actions";

export function SignupForm() {
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
      <h1 className="text-[1.05rem] font-semibold">Create your class-room</h1>
      <p className="mb-5 mt-1 text-[0.8rem] text-fg-secondary">
        Free while in early access — remember every student from day one.
      </p>

      <OAuthButtons />
      <OrDivider />

      <form
        action={(fd) => {
          setError(null);
          startTransition(async () => {
            const result = await createAccount(fd);
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
        <Field label="Full name">
          <Input name="fullName" required autoComplete="name" />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" required autoComplete="email" />
        </Field>
        <Field label="Password" hint="At least 8 characters">
          <Input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </Field>
        {error && <p className="text-[0.8rem] text-danger">{error}</p>}
        <Button
          type="submit"
          variant="primary"
          loading={pending}
          className="w-full"
        >
          Create account
        </Button>
      </form>

      <p className="mt-4 text-center text-[0.78rem] text-fg-secondary">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-accent-text hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
