import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { ArrowLeft, GraduationCap } from "lucide-react";
import { db, students, vocabularyItems } from "@/db";
import {
  PracticeSession,
  type PracticeCard,
} from "@/components/portal/practice-session";

export const metadata: Metadata = { title: "Practice" };

const SESSION_SIZE = 20;

/** Flashcard practice over the student's own lesson-derived vocabulary. */
export default async function PracticePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const student = await db.query.students.findFirst({
    where: eq(students.portalToken, token),
    columns: { id: true, name: true },
  });
  if (!student) notFound();

  const due = await db
    .select({
      id: vocabularyItems.id,
      term: vocabularyItems.term,
      meaning: vocabularyItems.meaning,
      translation: vocabularyItems.translation,
      example: vocabularyItems.example,
    })
    .from(vocabularyItems)
    .where(
      and(
        eq(vocabularyItems.studentId, student.id),
        or(
          isNull(vocabularyItems.srsDueAt),
          lte(vocabularyItems.srsDueAt, sql`now()`),
        ),
      ),
    )
    .orderBy(sql`${vocabularyItems.srsDueAt} ASC NULLS FIRST`, asc(vocabularyItems.createdAt))
    .limit(SESSION_SIZE);

  const cards: PracticeCard[] = due;

  return (
    <div className="mx-auto max-w-xl px-6 py-10">
      <header className="mb-8">
        <p className="mb-3 inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-fg-tertiary">
          <span className="flex size-5 items-center justify-center rounded bg-accent text-white">
            <GraduationCap className="size-3" />
          </span>
          Practice
        </p>
        <h1 className="text-[1.625rem] font-semibold tracking-tight">
          Your vocabulary workout
        </h1>
        <p className="mt-1 text-[0.9375rem] text-fg-secondary">
          Words from your own lessons, resurfaced right when you&rsquo;re about
          to forget them.
        </p>
      </header>

      <PracticeSession token={token} cards={cards} />

      <footer className="mt-10 border-t border-border pt-4 text-center text-[0.78rem] text-fg-tertiary">
        <Link
          href={`/p/${token}`}
          className="inline-flex items-center gap-1 hover:text-fg"
        >
          <ArrowLeft className="size-3" />
          Back to your classroom
        </Link>
      </footer>
    </div>
  );
}
