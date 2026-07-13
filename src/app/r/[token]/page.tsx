import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq, isNotNull } from "drizzle-orm";
import { format } from "date-fns";
import {
  ArrowRight,
  BookMarked,
  ClipboardList,
  GraduationCap,
  SpellCheck2,
} from "lucide-react";
import {
  corrections,
  db,
  homework,
  lessons,
  students,
  teachers,
  vocabularyItems,
} from "@/db";

export const metadata: Metadata = { title: "Lesson recap" };

/**
 * Public student-facing recap. The token in the URL is the sole
 * authorization; only teacher-approved, student-visible content renders —
 * private notes, insights, and the raw input never appear here.
 */
export default async function RecapPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const row = await db
    .select({
      lesson: lessons,
      studentName: students.name,
      teacherName: teachers.name,
    })
    .from(lessons)
    .innerJoin(students, eq(students.id, lessons.studentId))
    .innerJoin(teachers, eq(teachers.id, lessons.teacherId))
    .where(and(eq(lessons.recapToken, token), isNotNull(lessons.recapSharedAt)))
    .limit(1);

  const found = row[0];
  if (!found?.lesson.studentVisibleSummary) notFound();
  const { lesson, studentName, teacherName } = found;

  const [lessonCorrections, lessonVocabulary, lessonHomework] =
    await Promise.all([
      db
        .select()
        .from(corrections)
        .where(
          and(
            eq(corrections.lessonId, lesson.id),
            eq(corrections.teacherApproved, true),
          ),
        )
        .orderBy(corrections.createdAt),
      db
        .select()
        .from(vocabularyItems)
        .where(eq(vocabularyItems.lessonId, lesson.id))
        .orderBy(vocabularyItems.createdAt),
      db
        .select()
        .from(homework)
        .where(eq(homework.lessonId, lesson.id))
        .orderBy(homework.createdAt),
    ]);

  return (
    <div className="mx-auto max-w-xl px-6 py-10">
      <header className="mb-8">
        <p className="mb-3 inline-flex items-center gap-1.5 text-[0.75rem] font-medium text-fg-tertiary">
          <span className="flex size-5 items-center justify-center rounded bg-accent text-white">
            <GraduationCap className="size-3" />
          </span>
          Lesson recap
        </p>
        <h1 className="text-[1.4rem] font-semibold tracking-tight">
          Hi {studentName} 👋
        </h1>
        <p className="mt-1 text-[0.85rem] text-fg-secondary">
          {format(new Date(lesson.startedAt), "EEEE, MMMM d yyyy")}
          {teacherName ? ` · with ${teacherName}` : ""}
        </p>
      </header>

      <section className="mb-8">
        <p className="whitespace-pre-wrap text-[0.95rem] leading-relaxed">
          {lesson.studentVisibleSummary}
        </p>
      </section>

      {lessonCorrections.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-[0.85rem] font-semibold text-fg-secondary">
            <SpellCheck2 className="size-4 text-accent" />
            Corrections to review
          </h2>
          <div className="space-y-2">
            {lessonCorrections.map((c) => (
              <div
                key={c.id}
                className="rounded-lg bg-surface px-4 py-3 shadow-card"
              >
                <p className="flex flex-wrap items-center gap-2 text-[0.9rem]">
                  <span className="text-danger line-through decoration-danger/50">
                    {c.originalText}
                  </span>
                  <ArrowRight className="size-3.5 shrink-0 text-fg-tertiary" />
                  <span className="font-medium text-success">
                    {c.correctedText}
                  </span>
                </p>
                {c.explanation && (
                  <p className="mt-1 text-[0.8rem] text-fg-secondary">
                    {c.explanation}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {lessonVocabulary.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-[0.85rem] font-semibold text-fg-secondary">
            <BookMarked className="size-4 text-accent" />
            New vocabulary
          </h2>
          <div className="space-y-2">
            {lessonVocabulary.map((v) => (
              <div
                key={v.id}
                className="rounded-lg bg-surface px-4 py-3 shadow-card"
              >
                <p className="text-[0.9rem] font-medium">{v.term}</p>
                {(v.meaning || v.translation) && (
                  <p className="text-[0.8rem] text-fg-secondary">
                    {[v.meaning, v.translation].filter(Boolean).join(" · ")}
                  </p>
                )}
                {v.example && (
                  <p className="mt-0.5 text-[0.8rem] italic text-fg-tertiary">
                    “{v.example}”
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {lessonHomework.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-[0.85rem] font-semibold text-fg-secondary">
            <ClipboardList className="size-4 text-accent" />
            Your homework
          </h2>
          <ul className="space-y-2">
            {lessonHomework.map((h) => (
              <li
                key={h.id}
                className="rounded-lg bg-surface px-4 py-3 shadow-card"
              >
                <p className="text-[0.9rem] font-medium">{h.title}</p>
                {h.description && (
                  <p className="mt-0.5 text-[0.8rem] text-fg-secondary">
                    {h.description}
                  </p>
                )}
                {h.dueAt && (
                  <p className="mt-0.5 text-[0.75rem] text-fg-tertiary">
                    Due {format(new Date(h.dueAt), "MMMM d")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {lesson.recapMessage && (
        <section className="mb-8 rounded-lg border-l-2 border-l-accent bg-surface px-4 py-3 shadow-card">
          <p className="text-[0.9rem] leading-relaxed">{lesson.recapMessage}</p>
          {teacherName && (
            <p className="mt-1.5 text-[0.8rem] text-fg-secondary">
              — {teacherName}
            </p>
          )}
        </section>
      )}

      <footer className="border-t border-border pt-4 text-center text-[0.72rem] text-fg-tertiary">
        Shared privately with you via Class-room
      </footer>
    </div>
  );
}
