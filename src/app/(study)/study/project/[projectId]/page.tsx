import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { Folder, Plus } from "lucide-react";
import { db, studyProjects, studyThreads } from "@/db";
import {
  createStudyThread,
  deleteStudyProject,
  updateStudyProject,
} from "@/lib/actions/study";
import { requireLearner } from "@/lib/auth";
import { STUDY_LANGUAGES } from "@/lib/study-languages";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";

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
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex min-w-0 items-center gap-2.5 text-[1.625rem] font-semibold tracking-tight">
          <Folder className="size-6 shrink-0 text-accent" />
          <span className="truncate">{project.name}</span>
        </h1>
        <form action={createStudyThread}>
          <input type="hidden" name="projectId" value={project.id} />
          <SubmitButton>
            <Plus className="size-3.5" />
            New chat
          </SubmitButton>
        </form>
      </header>

      <section className="mb-6 rounded-lg bg-surface p-4 shadow-card sm:p-5">
        <h2 className="mb-3 text-[0.9375rem] font-semibold">
          Project settings
        </h2>
        <form
          action={updateStudyProject.bind(null, project.id)}
          className="space-y-4"
        >
          <Field label="Name">
            <Input
              name="name"
              required
              maxLength={80}
              defaultValue={project.name}
            />
          </Field>
          <Field
            label="Language"
            hint="Set → chats here get the language tutor with your vocabulary."
          >
            <Select name="language" defaultValue={project.language ?? ""}>
              <option value="">Not language-specific</option>
              {STUDY_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Custom instructions"
            hint="The AI follows these in every chat in this project."
          >
            <Textarea
              name="instructions"
              rows={5}
              maxLength={4000}
              defaultValue={project.instructions ?? ""}
              placeholder="e.g. Always correct my grammar strictly. Keep replies short."
            />
          </Field>
          <div className="flex items-center justify-between">
            <SubmitButton>Save project</SubmitButton>
          </div>
        </form>
      </section>

      <section className="mb-6">
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
                  href={`/study?t=${thread.id}`}
                  className="block truncate rounded-lg bg-surface px-4 py-2.5 text-[0.9375rem] shadow-card transition-colors hover:bg-surface-hover"
                >
                  {thread.title ?? "New chat"}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form
        action={deleteStudyProject.bind(null, project.id)}
        className="border-t border-border pt-4"
      >
        <button
          type="submit"
          className="text-[0.875rem] text-danger hover:underline"
        >
          Delete project
        </button>
        <span className="ml-2 text-[0.8125rem] text-fg-tertiary">
          Its chats survive and move to “Chats”.
        </span>
      </form>
    </div>
  );
}
