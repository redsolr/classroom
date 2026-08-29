import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookOpenCheck } from "lucide-react";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { db, studyVocab, studyVocabListItems, studyVocabLists } from "@/db";
import { requireLearner } from "@/lib/auth";
import { StudyReview } from "@/components/study/study-review";
import { BackLink, PageHeader, PageShell } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Review" };

export default async function StudyReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ book?: string }>;
}) {
  const learner = await requireLearner();
  const { book } = await searchParams;

  // `?book=` makes a book an actual study unit instead of a pure
  // grouping: same SM-2 schedule and the same rows, just a narrower
  // draw. Without it the deck is the whole dictionary, as before.
  const list = book
    ? await db.query.studyVocabLists.findFirst({
        where: and(
          eq(studyVocabLists.id, book),
          eq(studyVocabLists.learnerId, learner.id),
        ),
      })
    : null;
  if (book && !list) notFound();

  const due = or(
    isNull(studyVocab.srsDueAt),
    lte(studyVocab.srsDueAt, new Date()),
  );
  const deckColumns = {
    id: studyVocab.id,
    language: studyVocab.language,
    term: studyVocab.term,
    reading: studyVocab.reading,
    meaning: studyVocab.meaning,
    example: studyVocab.example,
  };

  // Never-reviewed cards first (srsDueAt null), then most-overdue.
  const deckQuery = list
    ? db
        .select(deckColumns)
        .from(studyVocab)
        .innerJoin(
          studyVocabListItems,
          eq(studyVocabListItems.vocabId, studyVocab.id),
        )
        .where(
          and(
            eq(studyVocab.learnerId, learner.id),
            eq(studyVocabListItems.listId, list.id),
            due,
          ),
        )
        .orderBy(sql`${studyVocab.srsDueAt} asc nulls first`)
        .limit(50)
    : db
        .select(deckColumns)
        .from(studyVocab)
        .where(and(eq(studyVocab.learnerId, learner.id), due))
        .orderBy(sql`${studyVocab.srsDueAt} asc nulls first`)
        .limit(50);

  // The practice offer needs to know the SCOPE isn't empty — a book with
  // nothing due but words in it should still offer a cram round.
  const totalQuery = list
    ? db
        .select({ totalWords: sql<number>`count(*)::int` })
        .from(studyVocab)
        .innerJoin(
          studyVocabListItems,
          eq(studyVocabListItems.vocabId, studyVocab.id),
        )
        .where(
          and(
            eq(studyVocab.learnerId, learner.id),
            eq(studyVocabListItems.listId, list.id),
          ),
        )
    : db
        .select({ totalWords: sql<number>`count(*)::int` })
        .from(studyVocab)
        .where(eq(studyVocab.learnerId, learner.id));

  const [deck, [{ totalWords }]] = await Promise.all([deckQuery, totalQuery]);

  return (
    <PageShell>
      {list && <BackLink href={`/vocab?book=${list.id}`}>{list.name}</BackLink>}
      <PageHeader
        icon={BookOpenCheck}
        title={list ? `Review — ${list.name}` : "Review"}
        subtitle={
          list
            ? "Swipe through what's due in this book — spaced repetition handles the rest."
            : "Swipe through what's due — spaced repetition handles the rest."
        }
      />
      {/* The deck is a stage — centered in the shell like a player,
          while the title stays on the shared page edge. */}
      <div className="mx-auto w-full max-w-xl">
        <StudyReview
          deck={deck}
          totalWords={totalWords}
          listId={list?.id ?? null}
        />
      </div>
    </PageShell>
  );
}
