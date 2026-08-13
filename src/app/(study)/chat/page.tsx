import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db, studyMessages, studyProjects, studyThreads } from "@/db";
import { STUDY_MODEL, STUDY_MODEL_ROSTER } from "@/lib/ai/study-tutor";
import { requireLearner } from "@/lib/auth";
import { threadTitle } from "@/lib/study-display";
import { StudyChat } from "@/components/study/study-chat";
import { ChatMenu } from "@/components/study/chat-menu";
import { NavbarActions } from "@/components/shell/navbar-actions";

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

  // The ⋯ menu's "Move to project" roster.
  const projects = active
    ? await db
        .select({ id: studyProjects.id, name: studyProjects.name })
        .from(studyProjects)
        .where(eq(studyProjects.learnerId, learner.id))
        .orderBy(asc(studyProjects.name))
    : [];

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

  // One ⋯ menu, nothing else — extraction (language chats with a
  // conversation) and deletion live inside it. Rendered twice (desktop
  // header + mobile navbar slot); exactly one is visible per viewport.
  const chatMenu = active ? (
    <ChatMenu
      threadId={active.id}
      pinned={active.pinned}
      canExtract={messages.length > 0}
      projectId={active.projectId}
      projects={projects}
    />
  ) : null;

  return (
    // Chrome (header, scroll region, composer) spans the full pane —
    // the readable column is capped INSIDE StudyChat, ChatGPT-style.
    <div className="flex h-[calc(100dvh-3rem)] w-full flex-col lg:h-dvh">
      {active ? (
        <>
          {/* Desktop-only chrome — on phones the navbar stays the single
              bar and the ⋯ menu portals into it (ChatGPT layout). */}
          <header className="chat-header hidden shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2.5 sm:px-6 lg:flex">
            <div className="chat-header-titles min-w-0">
              <h1 className="chat-title truncate text-[0.9375rem] font-semibold">
                {threadTitle(active)}
              </h1>
              <p className="chat-subtitle truncate text-[0.78rem] text-fg-tertiary">
                {project ? (
                  <Link
                    href={`/project/${project.id}`}
                    className="hover:text-fg hover:underline"
                  >
                    {project.name}
                  </Link>
                ) : (
                  (chatLanguage ?? "Chat")
                )}
              </p>
            </div>
            {chatMenu}
          </header>
          <NavbarActions>{chatMenu}</NavbarActions>
          <StudyChat
            key={active.id}
            threadId={active.id}
            language={chatLanguage}
            initialMessages={messages}
            models={STUDY_MODEL_ROSTER}
            defaultModel={STUDY_MODEL}
          />
        </>
      ) : (
        // No hero, no extra tap: /chat IS the chat window — the draft
        // composer is ready immediately and the thread is created on the
        // first send (ChatGPT behavior).
        <StudyChat
          threadId={null}
          language={null}
          initialMessages={[]}
          models={STUDY_MODEL_ROSTER}
          defaultModel={STUDY_MODEL}
        />
      )}
    </div>
  );
}
