import type { Metadata } from "next";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { db, studyVocab } from "@/db";
import { requireLearner } from "@/lib/auth";
import { StudyReview } from "@/components/study/study-review";

export const metadata: Metadata = { title: "Review" };

export default async function StudyReviewPage() {
  const learner = await requireLearner();

  // Never-reviewed cards first (srsDueAt null), then most-overdue.
  const deck = await db
    .select({
      id: studyVocab.id,
      language: studyVocab.language,
      term: studyVocab.term,
      reading: studyVocab.reading,
      meaning: studyVocab.meaning,
      example: studyVocab.example,
    })
    .from(studyVocab)
    .where(
      and(
        eq(studyVocab.learnerId, learner.id),
        or(isNull(studyVocab.srsDueAt), lte(studyVocab.srsDueAt, new Date())),
      ),
    )
    .orderBy(sql`${studyVocab.srsDueAt} asc nulls first`)
    .limit(50);

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-8 sm:px-6">
      <h1 className="mb-5 text-[1.625rem] font-semibold tracking-tight">
        Review
      </h1>
      <StudyReview deck={deck} />
    </div>
  );
}
