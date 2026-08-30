"use client";

import * as React from "react";
import { Link2, Share2 } from "lucide-react";
import { shareStudyBook, unshareStudyBook } from "@/lib/actions/books";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/page-header";
import { toast } from "@/components/ui/toaster";

/**
 * SHARING A BOOK — a revocable, read-only link.
 *
 * The copy on this card is doing real work, so it is worth defending:
 * it says what the recipient CAN do (read it, take a copy) and what they
 * cannot (change yours). A share control that just produces a URL leaves
 * people guessing about that, and the guess they make is usually the
 * frightening one.
 *
 * Read-only is not a limitation we are apologising for. Two people
 * studying the same material diverge within a week, and a live shared
 * book would mean one person's pruning silently deletes the other's
 * cards. Collaborative editing is a separate arc that needs the realtime
 * transport decision (docs/realtime-collab.md).
 */
export function BookShareCard({
  bookId,
  shareToken,
}: {
  bookId: string;
  shareToken: string | null;
}) {
  const [token, setToken] = React.useState(shareToken);
  const [pending, startTransition] = React.useTransition();

  // Built on the client so it is the ORIGIN the person is actually on —
  // a link minted server-side would carry whatever NEXT_PUBLIC_APP_URL
  // says, which is wrong on every preview deployment.
  const url =
    token && typeof window !== "undefined"
      ? `${window.location.origin}/b/${token}`
      : null;

  const share = () =>
    startTransition(async () => {
      try {
        const result = await shareStudyBook(bookId);
        setToken(result.token);
        toast.success("Share link created");
      } catch (error) {
        console.error("book share: failed to create link", error);
      }
    });

  const stop = () =>
    startTransition(async () => {
      try {
        await unshareStudyBook(bookId);
        setToken(null);
        toast.success("Share link revoked");
      } catch (error) {
        console.error("book share: failed to revoke link", error);
      }
    });

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Share2 className="size-4 text-fg-tertiary" />
            Share
          </span>
        }
      />
      <div className="space-y-3 px-4 py-4">
        {token ? (
          <>
            <p className="text-[0.875rem] text-fg-secondary">
              Anyone with this link can read the book and take their own
              copy of its decks. They can&rsquo;t change yours, and their
              copy starts unreviewed — nobody inherits your schedule.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md bg-surface-hover px-3 py-2 text-[0.8125rem]">
                {url ?? "…"}
              </code>
              <Button
                onClick={() => {
                  if (!url) return;
                  void navigator.clipboard.writeText(url);
                  toast.success("Link copied");
                }}
              >
                <Link2 className="size-3.5" />
                Copy
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" loading={pending} onClick={share}>
                Replace link
              </Button>
              <Button variant="danger" loading={pending} onClick={stop}>
                Stop sharing
              </Button>
            </div>
            <p className="text-[0.8125rem] text-fg-tertiary">
              Replacing the link revokes the old one immediately.
            </p>
          </>
        ) : (
          <>
            <p className="text-[0.875rem] text-fg-secondary">
              Create a link anyone can open — no account needed. They see
              the decks and notes, and can copy them into their own books.
            </p>
            <Button loading={pending} onClick={share}>
              <Share2 className="size-3.5" />
              Create share link
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
