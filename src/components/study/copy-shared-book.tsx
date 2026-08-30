"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { copySharedBook } from "@/lib/actions/books";
import { Button } from "@/components/ui/button";

/**
 * "Take a copy" on a shared book.
 *
 * The action resolves the caller itself (`requireLearner`), so an
 * anonymous visitor pressing this is bounced to login and lands back
 * here — which is the right flow and needs no gate on this button. A
 * signed-out state that hides the button instead would leave someone
 * looking at a book with no way to act on it and no explanation.
 *
 * Errors surface INLINE rather than as a toast: a revoked link is
 * something the visitor has to act on (ask for a new one), and a message
 * that leaves on a timer is the wrong home for that.
 */
export function CopySharedBookButton({ token }: { token: string }) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const router = useRouter();

  return (
    <div className="space-y-2">
      <Button
        variant="primary"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            try {
              const { id } = await copySharedBook(token);
              router.push(`/books/${id}`);
            } catch (err) {
              console.error("shared book: copy failed", err);
              setError(
                err instanceof Error
                  ? err.message
                  : "Couldn't copy this book — try again.",
              );
            }
          })
        }
      >
        <Copy className="size-4" />
        Copy to my books
      </Button>
      <p className="text-[0.8125rem] text-fg-tertiary">
        You get your own copy to edit and drill. Nothing you do touches
        the original, and your cards start unreviewed — you don&rsquo;t
        inherit someone else&rsquo;s schedule.
      </p>
      {error && <p className="text-[0.875rem] text-danger">{error}</p>}
    </div>
  );
}
