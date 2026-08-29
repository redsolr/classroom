import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookOpenCheck } from "lucide-react";
import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import {
  db,
  studyPackItems,
  studyPacks,
  studyVocab,
  studyVocabListItems,
  studyVocabLists,
} from "@/db";
import { requireLearner } from "@/lib/auth";
import { SectionTabs } from "@/components/study/section-tabs";
import { StudyReview } from "@/components/study/study-review";
import { BackLink, PageHeader, PageShell } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Decks" };

export default async function StudyReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ book?: string; pack?: string }>;
}) {
  const learner = await requireLearner();
  const { book, pack } = await searchParams;

  // ── Official book, drilled without saving it ──
  // The second of the two doors onto one catalog: browse-and-copy lives
  // under Books, this one drills the same words directly. Pack items
  // aren't the learner's rows, so there's no schedule to move — the
  // session is a practice round from the first card.
  if (pack) {
    const officialBook = await db.query.studyPacks.findFirst({
      where: eq(studyPacks.slug, pack),
    });
    if (!officialBook) notFound();

    const packCards = await db
      .select({
        id: studyPackItems.id,
        language: sql<string>`${officialBook.language}`,
        term: studyPackItems.term,
        reading: studyPackItems.reading,
        meaning: studyPackItems.meaning,
        example: studyPackItems.example,
      })
      .from(studyPackItems)
      .where(eq(studyPackItems.packId, officialBook.id))
      .orderBy(asc(studyPackItems.position));

    return (
      <PageShell>
        <BackLink href={`/packs/${officialBook.slug}`}>
          {officialBook.name}
        </BackLink>
        <PageHeader
          icon={BookOpenCheck}
          title={`Deck — ${officialBook.name}`}
          subtitle="Drilling an official book. Nothing is saved and no schedule moves — save it as your book first if you want it tracked."
        />
        <div className="mx-auto w-full max-w-xl">
          <StudyReview
            deck={packCards}
            totalWords={packCards.length}
            packSlug={officialBook.slug}
            initialMode="practice"
          />
        </div>
      </PageShell>
    );
  }

  // `?book=` makes a book an actual study unit instead of a pure
  // grouping: same SM-2 schedule and the same rows, just a narrower
  // draw. Without it the deck is the whole vocabulary, as before.
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
        title={list ? `Deck — ${list.name}` : "Decks"}
        subtitle={
          list
            ? "Swipe through what's due in this book — spaced repetition handles the rest."
            : "Swipe through what's due — spaced repetition handles the rest."
        }
      />

      {/* Official is one tap from the drill surface too — same catalog,
          reached from whichever section you happen to be standing in. */}
      {!list && (
        <SectionTabs
          tabs={[
            { href: "/vocab/review", label: "My decks", active: true },
            { href: "/packs", label: "Official", active: false },
          ]}
        />
      )}

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
