"use client";

import * as React from "react";
import { markThreadRead } from "@/lib/actions/messages";

/**
 * Mark this side of the thread read, once, when it is opened.
 *
 * A client component rather than a server-side write during render: a
 * render that mutates and then revalidates its own path is a loop, and
 * Next refuses `revalidatePath` from a render for exactly that reason.
 *
 * Read means OPENED. Not "scrolled past", which would be a claim about
 * whether someone took something in that we cannot stand behind, and not
 * "replied", which would leave a badge burning on a thread the tutor has
 * already dealt with in a lesson.
 */
export function MarkThreadRead({
  threadId,
  unread,
}: {
  threadId: string;
  /** Skip the write entirely when there was nothing new — opening a
   * thread you have already read should not cost a round trip or a
   * layout revalidation. */
  unread: number;
}) {
  React.useEffect(() => {
    if (unread === 0) return;
    void markThreadRead(threadId).catch((error: unknown) => {
      // Losing a read receipt is survivable — the badge simply stays up
      // until the next visit. Failing the page over it would not be.
      console.error("[messages] mark-read failed:", error);
    });
  }, [threadId, unread]);

  return null;
}
