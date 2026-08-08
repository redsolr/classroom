import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq } from "drizzle-orm";
import { Languages, Plus } from "lucide-react";
import { db, studyMessages, studyThreads, type StudyThread } from "@/db";
import { createStudyThread } from "@/lib/actions/study";
import { STUDY_MODEL, STUDY_MODELS } from "@/lib/ai/study-tutor";
import { requireLearner } from "@/lib/auth";
import { STUDY_LANGUAGES } from "@/lib/study-languages";
import { StudyChat } from "@/components/study/study-chat";
import { DeleteThreadButton } from "@/components/study/delete-thread-button";
import { ThreadSwitcher } from "@/components/study/thread-switcher";
import { Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Study chat" };

function threadTitle(thread: Pick<StudyThread, "title" | "language">): string {
  return thread.title ?? `${thread.language} chat`;
}

function NewThreadForm() {
  return (
    <form action={createStudyThread} className="flex items-center gap-2">
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
      <SubmitButton>
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
    <div className="mx-auto flex h-[calc(100dvh-3rem)] w-full max-w-5xl lg:h-dvh">
      {/* Desktop thread column (mobile uses the header switcher). */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border lg:flex">
        <div className="border-b border-border p-3">
          <NewThreadForm />
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
        {active ? (
          <>
            <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2 sm:px-6">
              <div className="min-w-0 flex-1 lg:hidden">
                <ThreadSwitcher
                  threads={threads.map((thread) => ({
                    id: thread.id,
                    label: threadTitle(thread).slice(0, 40),
                  }))}
                  activeId={active.id}
                />
              </div>
              <div className="hidden min-w-0 flex-1 lg:block">
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
              {threads.length > 0 && (
                <div className="mt-6 space-y-1 text-left lg:hidden">
                  <p className="px-1 text-[0.78rem] font-semibold tracking-wider text-fg-tertiary uppercase">
                    Recent chats
                  </p>
                  {threads.slice(0, 5).map((thread) => (
                    <Link
                      key={thread.id}
                      href={`/study?t=${thread.id}`}
                      className="block truncate rounded-md px-2.5 py-2 text-[0.9375rem] hover:bg-surface-hover"
                    >
                      {threadTitle(thread)}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
