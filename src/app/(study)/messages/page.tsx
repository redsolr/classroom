import type { Metadata } from "next";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { MessagesSquare } from "lucide-react";
import { requireLearner } from "@/lib/auth";
import { inboxFor } from "@/lib/message-queries";
import { Avatar } from "@/components/ui/avatar";
import { Card, PageHeader, PageShell } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { EnableNotifications } from "@/components/messages/enable-notifications";

export const metadata: Metadata = { title: "Messages" };

/**
 * THE INBOX.
 *
 * One list, both roles. A person here is routinely a teacher AND
 * somebody's student — the founder is both, and any tutor who is also
 * learning a language will be — so splitting this into "my students" and
 * "my tutors" would invent a navigation decision out of a fact about the
 * data model. The row says who; the badge says whether they are waiting.
 *
 * It lives in the `(study)` group because that layout already picks the
 * right sidebar from the account's role and guarantees a learner row.
 * The teacher shell would have redirected every student who followed a
 * notification here.
 */
export default async function MessagesPage() {
  const caller = await requireLearner();
  const threads = await inboxFor(caller);

  return (
    <PageShell>
      <PageHeader
        icon={MessagesSquare}
        title="Messages"
        subtitle="Between lessons — where the work actually gets checked on."
        actions={<EnableNotifications />}
      />

      {threads.length === 0 ? (
        <EmptyState
          icon={<MessagesSquare />}
          title="No conversations yet"
          description="A thread opens the first time you or your tutor says something. Teachers can start one from a student's page; learners get one with every tutor they book."
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {threads.map((thread) => (
              <li key={thread.id}>
                <Link
                  href={`/messages/${thread.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-hover"
                >
                  <Avatar name={thread.otherName} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[0.9375rem] font-medium">
                        {thread.otherName}
                      </span>
                      {/* Which side of this relationship the reader is
                          on. Cheap, and without it a name in a mixed
                          list is ambiguous for anyone who both teaches
                          and studies. */}
                      <span className="shrink-0 text-[0.72rem] tracking-wider text-fg-tertiary uppercase">
                        {thread.role === "teacher" ? "student" : "tutor"}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[0.875rem] text-fg-secondary">
                      {thread.preview ?? "No messages yet"}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {thread.lastMessageAt && (
                      <span className="text-[0.75rem] text-fg-tertiary">
                        {formatDistanceToNow(thread.lastMessageAt, {
                          addSuffix: true,
                        })}
                      </span>
                    )}
                    {thread.unread > 0 && (
                      <span
                        className="min-w-5 rounded-full bg-accent px-1.5 py-0.5 text-center text-[0.7rem] font-semibold text-white"
                        aria-label={`${thread.unread} unread`}
                      >
                        {thread.unread}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </PageShell>
  );
}
