import type { Metadata } from "next";
import { and, asc, eq } from "drizzle-orm";
import { Languages, Plus } from "lucide-react";
import { db, studyMessages, studyThreads, type StudyThread } from "@/db";
import { createStudyThread } from "@/lib/actions/study";
import { STUDY_MODEL, STUDY_MODELS } from "@/lib/ai/study-tutor";
import { requireLearner } from "@/lib/auth";
import { STUDY_LANGUAGES } from "@/lib/study-languages";
import { StudyChat } from "@/components/study/study-chat";
import { DeleteThreadButton } from "@/components/study/delete-thread-button";
import { Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";

export const metadata: Metadata = { title: "Study chat" };

function threadTitle(thread: Pick<StudyThread, "title" | "language">): string {
  return thread.title ?? `${thread.language} chat`;
}

export default async function StudyChatPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const learner = await requireLearner();
  const { t } = await searchParams;

  const active = t
    ? await db.query.studyThreads.findFirst({
        where: and(
          eq(studyThreads.id, t),
          eq(studyThreads.learnerId, learner.id),
        ),
      })
    : undefined;

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
    <div className="mx-auto flex h-[calc(100dvh-3rem)] w-full max-w-3xl flex-col lg:h-dvh">
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
              Your chats live in the sidebar, grouped by language.
            </p>
            <form
              action={createStudyThread}
              className="mx-auto flex max-w-sm items-center gap-2"
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
              <SubmitButton>
                <Plus className="size-3.5" />
                New chat
              </SubmitButton>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
