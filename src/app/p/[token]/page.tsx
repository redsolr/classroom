import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { format, formatDistanceToNow } from "date-fns";
import {
  ArrowRight,
  BookMarked,
  ClipboardList,
  GraduationCap,
  Target,
  TrendingUp,
} from "lucide-react";
import {
  db,
  goals,
  homework,
  lessons,
  students,
  teachers,
  vocabularyItems,
} from "@/db";
import { submitHomeworkViaPortal } from "@/lib/actions/portal";
import { Badge, homeworkStatusTone, vocabularyStatusTone } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";

export const metadata: Metadata = { title: "Your class-room" };

/**
 * Persistent student portal. The token in the URL is the sole
 * authorization (revocable — the teacher can rotate or disable it).
 * Only teacher-approved, student-visible content renders here: recaps,
 * vocabulary, homework, goals. Private notes, insights, and raw lesson
 * input are never queried by this page.
 */
export default async function PortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const row = await db
    .select({ student: students, teacherName: teachers.name })
    .from(students)
    .innerJoin(teachers, eq(teachers.id, students.teacherId))
    .where(eq(students.portalToken, token))
    .limit(1);

  const found = row[0];
  if (!found) notFound();
  const { student, teacherName } = found;

  const [studentHomework, vocabulary, activeGoals, sharedLessons] =
    await Promise.all([
      db
        .select()
        .from(homework)
        .where(eq(homework.studentId, student.id))
        .orderBy(desc(homework.createdAt)),
      db
        .select()
        .from(vocabularyItems)
        .where(eq(vocabularyItems.studentId, student.id))
        .orderBy(desc(vocabularyItems.createdAt)),
      db
        .select()
        .from(goals)
        .where(and(eq(goals.studentId, student.id), eq(goals.status, "active")))
        .orderBy(desc(goals.createdAt)),
      db
        .select({
          id: lessons.id,
          title: lessons.title,
          startedAt: lessons.startedAt,
          recapToken: lessons.recapToken,
          recapSharedAt: lessons.recapSharedAt,
        })
        .from(lessons)
        .where(
          and(
            eq(lessons.studentId, student.id),
            isNotNull(lessons.recapSharedAt),
            isNotNull(lessons.recapToken),
          ),
        )
        .orderBy(desc(lessons.startedAt)),
    ]);

  const openHomework = studentHomework.filter((h) => h.status === "assigned");
  const pastHomework = studentHomework.filter((h) => h.status !== "assigned");
  const masteredCount = vocabulary.filter((v) => v.status === "mastered").length;
  const doneHomework = studentHomework.filter((h) =>
    ["completed", "reviewed"].includes(h.status),
  ).length;

  return (
    <div className="mx-auto max-w-xl px-6 py-10">
      <header className="mb-8">
        <p className="mb-3 inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-fg-tertiary">
          <span className="flex size-5 items-center justify-center rounded bg-accent text-white">
            <GraduationCap className="size-3" />
          </span>
          Your class-room
        </p>
        <h1 className="text-[1.625rem] font-semibold tracking-tight">
          Hi {student.name} 👋
        </h1>
        <p className="mt-1 text-[0.9375rem] text-fg-secondary">
          {student.targetLanguage}
          {student.currentLevel ? ` · ${student.currentLevel}` : ""}
          {teacherName ? ` · with ${teacherName}` : ""}
        </p>
      </header>

      <section className="mb-8 flex gap-3">
        <div className="flex-1 rounded-lg bg-surface px-4 py-3 shadow-card">
          <p className="text-[0.78rem] font-medium text-fg-tertiary">
            Words mastered
          </p>
          <p className="mt-0.5 text-[1.25rem] leading-none font-semibold">
            {masteredCount}
            <span className="text-[0.875rem] font-normal text-fg-tertiary">
              {" "}
              of {vocabulary.length}
            </span>
          </p>
        </div>
        <div className="flex-1 rounded-lg bg-surface px-4 py-3 shadow-card">
          <p className="text-[0.78rem] font-medium text-fg-tertiary">
            Homework finished
          </p>
          <p className="mt-0.5 text-[1.25rem] leading-none font-semibold">
            {doneHomework}
            <span className="text-[0.875rem] font-normal text-fg-tertiary">
              {" "}
              of {studentHomework.length}
            </span>
          </p>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-[0.9375rem] font-semibold text-fg-secondary">
          <ClipboardList className="size-4 text-accent" />
          Your homework
        </h2>
        {openHomework.length === 0 ? (
          <p className="rounded-lg bg-surface px-4 py-3 text-[0.9375rem] text-fg-secondary shadow-card">
            Nothing to do right now — nice work. 🎉
          </p>
        ) : (
          <ul className="space-y-3">
            {openHomework.map((h) => (
              <li key={h.id} className="rounded-lg bg-surface px-4 py-3 shadow-card">
                <p className="text-[0.9375rem] font-medium">{h.title}</p>
                {h.description && (
                  <p className="mt-0.5 text-[0.875rem] text-fg-secondary">
                    {h.description}
                  </p>
                )}
                {h.dueAt && (
                  <p className="mt-0.5 text-[0.8125rem] text-fg-tertiary">
                    Due {format(new Date(h.dueAt), "MMMM d")}
                  </p>
                )}
                <form
                  action={submitHomeworkViaPortal.bind(null, token, h.id)}
                  className="mt-3 space-y-2"
                >
                  <Textarea
                    name="submissionText"
                    rows={3}
                    placeholder="Write your answer here, or paste a link to your work (optional)"
                  />
                  <div className="flex justify-end">
                    <SubmitButton size="sm">Send to teacher</SubmitButton>
                  </div>
                </form>
              </li>
            ))}
          </ul>
        )}
        {pastHomework.length > 0 && (
          <ul className="mt-3 space-y-2">
            {pastHomework.map((h) => (
              <li
                key={h.id}
                className="flex items-start gap-2.5 rounded-lg bg-surface px-4 py-3 shadow-card"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem]">{h.title}</span>
                  {h.teacherFeedback && (
                    <span className="mt-0.5 block text-[0.875rem] text-fg-secondary">
                      Feedback: {h.teacherFeedback}
                    </span>
                  )}
                </span>
                <Badge tone={homeworkStatusTone[h.status]}>{h.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      {vocabulary.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-[0.9375rem] font-semibold text-fg-secondary">
            <BookMarked className="size-4 text-accent" />
            Your vocabulary
          </h2>
          <ul className="space-y-2">
            {vocabulary.map((v) => (
              <li
                key={v.id}
                className="flex items-start gap-2.5 rounded-lg bg-surface px-4 py-3 shadow-card"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem] font-medium">
                    {v.term}
                  </span>
                  {(v.meaning || v.translation) && (
                    <span className="block text-[0.875rem] text-fg-secondary">
                      {[v.meaning, v.translation].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
                <Badge tone={vocabularyStatusTone[v.status]}>{v.status}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      {activeGoals.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-[0.9375rem] font-semibold text-fg-secondary">
            <Target className="size-4 text-accent" />
            What we&rsquo;re working toward
          </h2>
          <ul className="space-y-2">
            {activeGoals.map((g) => (
              <li key={g.id} className="rounded-lg bg-surface px-4 py-3 shadow-card">
                <p className="text-[0.9375rem] font-medium">{g.title}</p>
                {g.description && (
                  <p className="mt-0.5 text-[0.875rem] text-fg-secondary">
                    {g.description}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {sharedLessons.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-[0.9375rem] font-semibold text-fg-secondary">
            <TrendingUp className="size-4 text-accent" />
            Lesson recaps
          </h2>
          <ul className="space-y-2">
            {sharedLessons.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/r/${l.recapToken}`}
                  className="flex items-center gap-3 rounded-lg bg-surface px-4 py-3 shadow-card transition-colors hover:bg-surface-hover"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.9375rem] font-medium">
                      {l.title ?? "Lesson recap"}
                    </span>
                    <span className="block text-[0.8125rem] text-fg-tertiary">
                      {format(new Date(l.startedAt), "EEEE, MMMM d yyyy")} ·{" "}
                      {formatDistanceToNow(new Date(l.startedAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </span>
                  <ArrowRight className="size-3.5 shrink-0 text-fg-tertiary" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="border-t border-border pt-4 text-center text-[0.78rem] text-fg-tertiary">
        Shared privately with you via Class-room
      </footer>
    </div>
  );
}
