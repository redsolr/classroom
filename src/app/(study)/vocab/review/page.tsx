import type { Metadata } from "next";
import Link from "next/link";
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
import { isCardDue } from "@/lib/srs";
import { DeckShelf, DeckShelfEmpty } from "@/components/study/deck-shelf";
import { OfficialShelf } from "@/components/study/official-shelf";
import { SectionTabs } from "@/components/study/section-tabs";
import { StudyReview } from "@/components/study/study-review";
import { BackLink, PageHeader, PageShell } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Decks" };

/**
 * DECKS — a shelf first, a card second.
 *
 *   /vocab/review              the deck shelf: pick what to drill
 *   /vocab/review?book=all     drill everything due
 *   /vocab/review?book=<id>    drill one book
 *   /vocab/review?pack=<slug>  drill an official book, saving nothing
 *
 * Landing straight on a card used to mean the app picked the deck for
 * you and never showed you the others; `?book=all` is that old behavior,
 * now something you choose.
 */
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

  // ── The shelf ──
  if (!book) {
    const now = new Date();
    const [words, listRows, listItemRows, officialRows] = await Promise.all([
      db
        .select({ id: studyVocab.id, srsDueAt: studyVocab.srsDueAt })
        .from(studyVocab)
        .where(eq(studyVocab.learnerId, learner.id)),
      db
        .select({ id: studyVocabLists.id, name: studyVocabLists.name })
        .from(studyVocabLists)
        .where(eq(studyVocabLists.learnerId, learner.id))
        .orderBy(asc(studyVocabLists.createdAt)),
      db
        .select({
          listId: studyVocabListItems.listId,
          vocabId: studyVocabListItems.vocabId,
        })
        .from(studyVocabListItems)
        .innerJoin(
          studyVocabLists,
          eq(studyVocabListItems.listId, studyVocabLists.id),
        )
        .where(eq(studyVocabLists.learnerId, learner.id)),
      db
        .select({
          id: studyPacks.id,
          slug: studyPacks.slug,
          name: studyPacks.name,
          language: studyPacks.language,
          itemCount: sql<number>`count(${studyPackItems.id})::int`,
        })
        .from(studyPacks)
        .leftJoin(studyPackItems, eq(studyPackItems.packId, studyPacks.id))
        .groupBy(studyPacks.id)
        .orderBy(asc(studyPacks.name)),
    ]);

    const dueById = new Map(
      words.map((w) => [w.id, isCardDue(w.srsDueAt, now)]),
    );
    const totalDue = words.filter((w) => isCardDue(w.srsDueAt, now)).length;

    const decks = [
      {
        id: "all",
        name: "All words",
        totalWords: words.length,
        dueCount: totalDue,
      },
      ...listRows.map((list) => {
        const memberIds = listItemRows
          .filter((row) => row.listId === list.id)
          .map((row) => row.vocabId);
        return {
          id: list.id,
          name: list.name,
          totalWords: memberIds.length,
          dueCount: memberIds.filter((id) => dueById.get(id)).length,
        };
      }),
    ];

    return (
      <PageShell>
        <PageHeader
          icon={BookOpenCheck}
          title="Decks"
          subtitle={
            totalDue > 0
              ? `${totalDue} card${totalDue === 1 ? "" : "s"} waiting — pick a deck and swipe.`
              : "Pick a deck and swipe — spaced repetition handles the rest."
          }
        />

        <SectionTabs
          tabs={[
            { href: "/vocab/review", label: "My decks", active: true },
            { href: "/packs", label: "Official", active: false },
          ]}
        />

        <div className="max-w-3xl">
          {words.length === 0 ? (
            <DeckShelfEmpty />
          ) : (
            <DeckShelf decks={decks} />
          )}
        </div>

        {/* Official books are drillable without saving anything, so the
            drill surface shows them too — same catalog, second door. */}
        <OfficialShelf items={officialRows} />
      </PageShell>
    );
  }

  // `?book=` makes a book an actual study unit instead of a pure
  // grouping: same SM-2 schedule and the same rows, just a narrower
  // draw. `?book=all` draws from the whole vocabulary.
  const list =
    book !== "all"
      ? await db.query.studyVocabLists.findFirst({
          where: and(
            eq(studyVocabLists.id, book),
            eq(studyVocabLists.learnerId, learner.id),
          ),
        })
      : null;
  if (book !== "all" && !list) notFound();

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
      <BackLink href="/vocab/review">All decks</BackLink>
      <PageHeader
        icon={BookOpenCheck}
        title={list ? `Deck — ${list.name}` : "Deck — All words"}
        subtitle={
          list
            ? "Swipe through what's due in this book — spaced repetition handles the rest."
            : "Swipe through what's due across every book."
        }
        actions={
          list ? (
            <Link
              href={`/vocab?book=${list.id}`}
              className="inline-flex h-9 items-center rounded-md bg-surface px-3.5 text-[0.9375rem] font-medium shadow-card transition-colors hover:bg-surface-hover"
            >
              Open book
            </Link>
          ) : null
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
