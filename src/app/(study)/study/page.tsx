import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq } from "drizzle-orm";
import { Languages, Plus } from "lucide-react";
import { db, studyMessages, studyThreads } from "@/db";
import { createStudyThread } from "@/lib/actions/study";
import { STUDY_MODEL, STUDY_MODELS } from "@/lib/ai/study-tutor";
import { requireLearner } from "@/lib/auth";
import { STUDY_LANGUAGES } from "@/lib/study-languages";
import type { StudyThread } from "@/db";
import { StudyChat } from "@/components/study/study-chat";
import { DeleteThreadButton } from "@/components/study/delete-thread-button";
import { Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Study chat" };

function threadTitle(thread: Pick<StudyThread, "title" | "language">): string {
  return thread.title ?? `${thread.language} chat`;
}

function NewThreadForm({ compact = false }: { compact?: boolean }) {
  return (
    <form
      action={createStudyThread}
      className={cn("flex items-center gap-2", compact ? "" : "max-w-sm")}
    >
      <Select
        name="language"
        defaultValue="French"
        aria-label="Language"
        className="flex-1"
      >
        {STUDY_LANGUAGES.map((lang) => (
          <option key={lang} value={lang}>
            {lang}
          </option>
        ))}
      </Select>
      <SubmitButton size={compact ? "sm" : "md"}>
        <Plus className="size-3.5" />
        New chat
      </SubmitButton>
    </form>
  );
}

export default async function StudyChatPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const learner = await requireLearner();
  const { t } = await searchParams;

  const threads = await db
    .select()
    .from(studyThreads)
    .where(eq(studyThreads.learnerId, learner.id))
    .orderBy(desc(studyThreads.updatedAt));

  const active = t ? threads.find((thread) => thread.id === t) : undefined;

  const messages = active
    ? await db
        .select({
          id: studyMessages.id,
          role: studyMessages.role,
          content: studyMessages.content,
          model: studyMessages.model,
        })
        .from(studyMessages)
        .where(
          and(
            eq(studyMessages.threadId, active.id),
            eq(studyMessages.learnerId, learner.id),
          ),
        )
        .orderBy(asc(studyMessages.createdAt))
    : [];

  return (
    <div className="mx-auto flex h-[calc(100dvh-3.5rem)] w-full max-w-5xl">
      {/* Thread list — a real column on desktop… */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border lg:flex">
        <div className="border-b border-border p-3">
          <NewThreadForm compact />
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {threads.length === 0 && (
            <p className="px-2.5 py-2 text-[0.875rem] text-fg-tertiary">
              No chats yet.
            </p>
          )}
          {threads.map((thread) => (
            <Link
              key={thread.id}
              href={`/study?t=${thread.id}`}
              className={cn(
                "block rounded-md px-2.5 py-2 transition-colors",
                thread.id === active?.id
                  ? "bg-accent-soft"
                  : "hover:bg-surface-hover",
              )}
            >
              <span className="block truncate text-[0.875rem] font-medium">
                {threadTitle(thread)}
              </span>
              <span className="block text-[0.75rem] text-fg-tertiary">
                {thread.language}
              </span>
            </Link>
          ))}
        </nav>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {/* …and a scrollable chip row on mobile. */}
        {threads.length > 0 && (
          <div className="scrollbar-none flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border px-4 py-2 lg:hidden">
            <Link
              href="/study"
              className="flex shrink-0 items-center gap-1 rounded-full border border-border-strong bg-surface px-2.5 py-1 text-[0.8125rem] font-medium"
            >
              <Plus className="size-3.5" />
              New
            </Link>
            {threads.map((thread) => (
              <Link
                key={thread.id}
                href={`/study?t=${thread.id}`}
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 text-[0.8125rem]",
                  thread.id === active?.id
                    ? "bg-accent-soft font-medium text-accent-text"
                    : "border border-border-strong bg-surface",
                )}
              >
                {threadTitle(thread).slice(0, 24)}
              </Link>
            ))}
          </div>
        )}

        {active ? (
          <>
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2.5 sm:px-6">
              <div className="min-w-0">
                <h1 className="truncate text-[0.9375rem] font-semibold">
                  {threadTitle(active)}
                </h1>
                <p className="text-[0.78rem] text-fg-tertiary">
                  {active.language}
                </p>
              </div>
              <DeleteThreadButton threadId={active.id} />
            </header>
            <StudyChat
              key={active.id}
              threadId={active.id}
              language={active.language}
              learnerName={learner.name}
              initialMessages={messages}
              models={
                STUDY_MODELS.includes(STUDY_MODEL)
                  ? STUDY_MODELS
                  : [STUDY_MODEL, ...STUDY_MODELS]
              }
              defaultModel={STUDY_MODEL}
            />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center px-6">
            <div className="w-full max-w-md text-center">
              <span className="mx-auto mb-4 flex size-11 items-center justify-center rounded-xl bg-accent text-white">
                <Languages className="size-5" />
              </span>
              <h1 className="text-[1.375rem] font-semibold tracking-tight">
                What are we studying today?
              </h1>
              <p className="mt-1.5 mb-5 text-[0.9375rem] text-fg-secondary">
                Pick a language and start chatting — your tutor corrects you,
                drills your own vocabulary, and suggests words worth saving.
              </p>
              <div className="mx-auto flex justify-center">
                <NewThreadForm />
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
