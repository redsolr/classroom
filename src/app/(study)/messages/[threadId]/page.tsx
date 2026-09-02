import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireLearner } from "@/lib/auth";
import { accountabilityFor, learnerForStudent } from "@/lib/accountability";
import {
  requireThreadParticipant,
  type ThreadParticipant,
} from "@/lib/message-guards";
import { threadMessages, type ThreadMessage } from "@/lib/message-queries";
import { draftNudge } from "@/lib/message-drafts";
import { Avatar } from "@/components/ui/avatar";
import { BackLink, PageShell } from "@/components/ui/page-header";
import { MessageList } from "@/components/messages/message-list";
import { MarkThreadRead } from "@/components/messages/mark-thread-read";
import { ThreadComposer } from "@/components/messages/thread-composer";

export const metadata: Metadata = { title: "Messages" };

/** Everything after my side's read mark that I did not write myself. */
function unreadFor(me: ThreadParticipant, messages: ThreadMessage[]): number {
  const readAt =
    me.role === "teacher" ? me.thread.teacherReadAt : me.thread.studentReadAt;
  return messages.filter(
    (m) => m.author !== me.role && (!readAt || m.createdAt > readAt),
  ).length;
}

export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ threadId: string }>;
  searchParams: Promise<{ nudge?: string }>;
}) {
  const { threadId } = await params;
  const { nudge } = await searchParams;
  const caller = await requireLearner();

  let me: ThreadParticipant;
  try {
    me = await requireThreadParticipant(caller, threadId);
  } catch {
    // "No such thread" and "not yours" are the same answer in the guard,
    // and they stay the same answer here.
    notFound();
  }

  const messages = await threadMessages(threadId);

  /**
   * The nudge, drafted server-side.
   *
   * Only for the teacher, only when they asked for it (`?nudge=1` from
   * the accountability card), and only when there is evidence to draw
   * on — a hand-typed student with no learner account has none, which is
   * a normal state rather than an error.
   */
  let prefill: string | undefined;
  if (nudge && me.role === "teacher") {
    const learnerId = await learnerForStudent(me.student.id, me.teacher.id);
    if (learnerId) {
      prefill = draftNudge(await accountabilityFor(learnerId), me.student.name);
    }
  }

  return (
    <PageShell>
      <MarkThreadRead threadId={threadId} unread={unreadFor(me, messages)} />
      <BackLink href="/messages">All messages</BackLink>

      <header className="mb-5 flex items-center gap-3">
        <Avatar name={me.otherName} size="lg" />
        <div className="min-w-0">
          <h1 className="truncate text-[1.625rem] font-semibold tracking-tight">
            {me.otherName}
          </h1>
          <p className="text-[0.9375rem] text-fg-secondary">
            {me.role === "teacher"
              ? `Your student${me.student.targetLanguage ? ` · ${me.student.targetLanguage}` : ""}`
              : "Your tutor"}
          </p>
        </div>
      </header>

      {/* The thread and its composer share one column: a chat that
          stretches to a 1800px shelf measure is unreadable, and the page
          shell's own width is the reading measure everything else here
          already uses. */}
      <div className="flex min-h-[60vh] flex-col justify-end gap-4">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-[0.875rem] text-fg-tertiary">
            {me.role === "teacher"
              ? `Nothing here yet. What ${me.student.name.split(" ")[0]} does between lessons shows up here as it happens.`
              : "Nothing here yet — say hello, or ask about anything you're stuck on."}
          </p>
        ) : (
          <MessageList messages={messages} role={me.role} />
        )}

        <ThreadComposer
          threadId={threadId}
          placeholder={`Message ${me.otherName.split(" ")[0]}…`}
          prefill={prefill}
          attachStrugglingWords={Boolean(prefill)}
        />
      </div>
    </PageShell>
  );
}
