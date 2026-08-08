"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteStudyThread } from "@/lib/actions/study";

export function DeleteThreadButton({ threadId }: { threadId: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const onClick = () => {
    if (!window.confirm("Delete this chat and its messages?")) return;
    startTransition(async () => {
      try {
        await deleteStudyThread(threadId);
      } catch (error) {
        // The action redirects on success (NEXT_REDIRECT is rethrown by
        // Next itself); anything reaching here is a real failure.
        console.error("study chat: failed to delete thread", error);
        router.refresh();
      }
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      title="Delete chat"
      className="flex size-8 items-center justify-center rounded-md text-fg-tertiary transition-colors hover:bg-surface-hover hover:text-danger disabled:opacity-50"
    >
      <Trash2 className="size-4" />
    </button>
  );
}
