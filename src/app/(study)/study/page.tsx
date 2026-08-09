import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { FolderPlus, Languages, Plus } from "lucide-react";
import { db, studyMessages, studyProjects, studyThreads } from "@/db";
import { createStudyThread } from "@/lib/actions/study";
import { STUDY_MODEL, STUDY_MODELS } from "@/lib/ai/study-tutor";
import { requireLearner } from "@/lib/auth";
import { threadTitle } from "@/lib/study-display";
import { StudyChat } from "@/components/study/study-chat";
import { DeleteThreadButton } from "@/components/study/delete-thread-button";
import { ExtractVocabButton } from "@/components/study/extract-vocab-dialog";
import { SubmitButton } from "@/components/ui/button";

export const metadata: Metadata = { title: "Study chat" };

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

  const project = active?.projectId
    ? await db.query.studyProjects.findFirst({
        where: and(
          eq(studyProjects.id, active.projectId),
          eq(studyProjects.learnerId, learner.id),
        ),
        columns: { id: true, name: true, language: true },
      })
    : undefined;
  const chatLanguage = project?.language ?? active?.language ?? null;

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
              <p className="truncate text-[0.78rem] text-fg-tertiary">
                {project ? (
                  <Link
                    href={`/study/project/${project.id}`}
                    className="hover:text-fg hover:underline"
                  >
                    {project.name}
                  </Link>
                ) : (
                  (chatLanguage ?? "Chat")
                )}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {/* Extraction needs a language to file words under and a
                  conversation to read — generic or empty chats hide it. */}
              {chatLanguage && messages.length > 0 && (
                <ExtractVocabButton threadId={active.id} />
              )}
              <DeleteThreadButton threadId={active.id} />
            </div>
          </header>
          <StudyChat
            key={active.id}
            threadId={active.id}
            language={chatLanguage}
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
              Start a chat about anything — or chat inside a project to get
              its custom instructions (language projects add your tutor and
              vocabulary). Chats live in the sidebar.
            </p>
            <div className="flex flex-col items-center gap-3">
              <form action={createStudyThread}>
                <SubmitButton>
                  <Plus className="size-3.5" />
                  New chat
                </SubmitButton>
              </form>
              <Link
                href="/study/project/new"
                className="inline-flex items-center gap-1.5 text-[0.9375rem] font-medium text-accent-text hover:underline"
              >
                <FolderPlus className="size-4" />
                New project
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
