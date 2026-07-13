"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { sendPasswordReset } from "./actions";

export function ForgotPasswordForm() {
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  if (sent) {
    return (
      <div>
        <h1 className="text-[1.05rem] font-semibold">Check your email</h1>
        <p className="mt-1 text-[0.8rem] leading-relaxed text-fg-secondary">
          If an account exists with that address, we&rsquo;ve sent a password
          reset link.
        </p>
        <Link
          href="/login"
          className="mt-4 block text-[0.78rem] font-medium text-accent-text hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-[1.05rem] font-semibold">Reset your password</h1>
      <p className="mb-5 mt-1 text-[0.8rem] text-fg-secondary">
        We&rsquo;ll email you a reset link.
      </p>
      <form
        action={(fd) => {
          setError(null);
          startTransition(async () => {
            const result = await sendPasswordReset(fd);
            if (result.error) {
              setError(result.error);
              return;
            }
            setSent(true);
          });
        }}
        className="space-y-3"
      >
        <Field label="Email">
          <Input name="email" type="email" required autoComplete="email" />
        </Field>
        {error && <p className="text-[0.8rem] text-danger">{error}</p>}
        <Button
          type="submit"
          variant="primary"
          loading={pending}
          className="w-full"
        >
          Send reset link
        </Button>
      </form>
      <Link
        href="/login"
        className="mt-4 block text-center text-[0.78rem] text-fg-secondary hover:text-fg hover:underline"
      >
        Back to sign in
      </Link>
    </div>
  );
}
