"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
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
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  return (
    <div>
      <h1 className="text-[1.05rem] font-semibold">Check your email</h1>
      <p className="mb-5 mt-1 text-[0.8rem] leading-relaxed text-fg-secondary">
        We sent a 6-digit code to <span className="font-medium text-fg">{email}</span>.
        Enter it below to verify your address.
      </p>
      <form
        action={(fd) => {
          setError(null);
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
        className="space-y-3"
      >
        <Field label="Verification code">
          <Input
            name="code"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            className="text-center font-mono tracking-[0.3em]"
          />
        </Field>
        {error && <p className="text-[0.8rem] text-danger">{error}</p>}
        <Button
          type="submit"
          variant="primary"
          loading={pending}
          className="w-full"
        >
          Verify and continue
        </Button>
      </form>
    </div>
  );
}
