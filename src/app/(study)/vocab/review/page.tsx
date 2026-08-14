import type { Metadata } from "next";
import { BookOpenCheck } from "lucide-react";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { db, studyVocab } from "@/db";
import { requireLearner } from "@/lib/auth";
import { StudyReview } from "@/components/study/study-review";
import { PageHeader, PageShell } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Review" };

export default async function StudyReviewPage() {
  const learner = await requireLearner();

  // Never-reviewed cards first (srsDueAt null), then most-overdue.
  const [deck, [{ totalWords }]] = await Promise.all([
    db
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
      .limit(50),
    // The practice offer needs to know the dictionary isn't empty.
    db
      .select({ totalWords: sql<number>`count(*)::int` })
      .from(studyVocab)
      .where(eq(studyVocab.learnerId, learner.id)),
  ]);

  return (
    <PageShell>
      <PageHeader
        icon={BookOpenCheck}
        title="Review"
        subtitle="Swipe through what's due — spaced repetition handles the rest."
      />
      {/* The deck is a stage — centered in the shell like a player,
          while the title stays on the shared page edge. */}
      <div className="mx-auto w-full max-w-xl">
        <StudyReview deck={deck} totalWords={totalWords} />
      </div>
    </PageShell>
  );
}
