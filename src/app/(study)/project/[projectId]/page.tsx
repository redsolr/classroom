import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { Folder, Plus, Settings } from "lucide-react";
import { db, studyProjects, studyThreads } from "@/db";
import { createStudyThread } from "@/lib/actions/study";
import { requireLearner } from "@/lib/auth";
import { EditProjectDialog } from "@/components/study/edit-project-dialog";
import { SubmitButton } from "@/components/ui/button";
import { PageHeader, PageShell } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Project" };

export default async function StudyProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const learner = await requireLearner();
  const { projectId } = await params;

  const project = await db.query.studyProjects.findFirst({
    where: and(
      eq(studyProjects.id, projectId),
      eq(studyProjects.learnerId, learner.id),
    ),
  });
  if (!project) notFound();

  const threads = await db
    .select({
      id: studyThreads.id,
      title: studyThreads.title,
      updatedAt: studyThreads.updatedAt,
    })
    .from(studyThreads)
    .where(
      and(
        eq(studyThreads.projectId, project.id),
        eq(studyThreads.learnerId, learner.id),
      ),
    )
    .orderBy(desc(studyThreads.updatedAt));

  return (
    <PageShell>
      {/* Settings live behind the dialog — the page leads with its
          CHATS (the settings card used to push them below the fold on
          phones). */}
      <PageHeader
        icon={Folder}
        title={project.name}
        actions={
          <>
            <EditProjectDialog project={project}>
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 py-2 text-[0.875rem] font-medium transition-colors hover:bg-surface-hover"
              >
                <Settings className="size-4 text-fg-tertiary" />
                Settings
              </button>
            </EditProjectDialog>
            <form action={createStudyThread}>
              <input type="hidden" name="projectId" value={project.id} />
              <SubmitButton>
                <Plus className="size-3.5" />
                New chat
              </SubmitButton>
            </form>
          </>
        }
      />

      <section className="mb-6 max-w-2xl">
        <h2 className="mb-2.5 text-[1rem] font-semibold">Chats</h2>
        {threads.length === 0 ? (
          <p className="text-[0.9375rem] text-fg-tertiary">
            No chats yet — start one with the button above.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {threads.map((thread) => (
              <li key={thread.id}>
                <Link
                  href={`/chat?t=${thread.id}`}
                  className="block truncate rounded-lg bg-surface px-4 py-2.5 text-[0.9375rem] shadow-card transition-colors hover:bg-surface-hover"
                >
                  {thread.title ?? "New chat"}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  );
}
