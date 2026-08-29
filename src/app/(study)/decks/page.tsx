import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpenCheck, MessageSquareQuote } from "lucide-react";
import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import {
  db,
  studyPackItems,
  studyPacks,
  studySentences,
  studyVocab,
  studyVocabListItems,
  studyVocabLists,
} from "@/db";
import { requireLearner } from "@/lib/auth";
import { isCardDue } from "@/lib/srs";
import {
  DeckShelf,
  DeckShelfEmpty,
  type DeckSummary,
} from "@/components/study/deck-shelf";
import { OfficialShelf } from "@/components/study/official-shelf";
import { SectionTabs } from "@/components/study/section-tabs";
import { StudyReview } from "@/components/study/study-review";
import { toSentenceCards, toWordCards } from "@/lib/study-cards";
import { BackLink, PageHeader, PageShell } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Decks" };

/**
 * DECKS — a shelf first, a card second.
 *
 *   /decks              the deck shelf: pick what to drill
 *   /decks?book=all     drill everything due
 *   /decks?book=<id>    drill one book
 *   /decks?pack=<slug>  drill an official book, saving nothing
 *
 * Landing straight on a card used to mean the app picked the deck for
 * you and never showed you the others; `?book=all` is that old behavior,
 * now something you choose.
 */
export default async function StudyReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ book?: string; pack?: string; sentences?: string }>;
}) {
  const learner = await requireLearner();
  const { book, pack, sentences } = await searchParams;

  // ── Sentence deck ──
  // The same stack, the same swipes, the same scheduler — a different
  // question. `?sentences=all` draws from every sentence card; a book id
  // narrows to the ones generated from that book.
  if (sentences) {
    const list =
      sentences !== "all"
        ? await db.query.studyVocabLists.findFirst({
            where: and(
              eq(studyVocabLists.id, sentences),
              eq(studyVocabLists.learnerId, learner.id),
            ),
          })
        : null;
    if (sentences !== "all" && !list) notFound();

    const scope = and(
      eq(studySentences.learnerId, learner.id),
      list ? eq(studySentences.listId, list.id) : undefined,
    );
    const [cards, [{ total }]] = await Promise.all([
      db
        .select({
          id: studySentences.id,
          language: studySentences.language,
          text: studySentences.text,
          translation: studySentences.translation,
          note: studySentences.note,
        })
        .from(studySentences)
        .where(
          and(
            scope,
            or(
              isNull(studySentences.srsDueAt),
              lte(studySentences.srsDueAt, new Date()),
            ),
          ),
        )
        .orderBy(sql`${studySentences.srsDueAt} asc nulls first`)
        .limit(50),
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(studySentences)
        .where(scope),
    ]);

    return (
      <PageShell>
        <BackLink href="/decks">All decks</BackLink>
        <PageHeader
          icon={MessageSquareQuote}
          title={list ? `Sentences — ${list.name}` : "Sentences"}
          subtitle="Fill the blank from the sentence around it — the test isn't what the word means, it's whether you can still supply it."
          actions={
            <Link
              href="/sentences"
              className="inline-flex h-9 items-center rounded-md bg-surface px-3.5 text-[0.9375rem] font-medium shadow-card transition-colors hover:bg-surface-hover"
            >
              Manage sentences
            </Link>
          }
        />
        <div className="mx-auto w-full max-w-xl">
          <StudyReview
            deck={toSentenceCards(cards)}
            totalWords={total}
            listId={list?.id ?? null}
            deckKind="sentence"
          />
        </div>
      </PageShell>
    );
  }

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
        <BackLink href={`/official/${officialBook.slug}`}>
          {officialBook.name}
        </BackLink>
        <PageHeader
          icon={BookOpenCheck}
          title={`Deck — ${officialBook.name}`}
          subtitle="Drilling an official book. Nothing is saved and no schedule moves — save it as your book first if you want it tracked."
        />
        <div className="mx-auto w-full max-w-xl">
          <StudyReview
            deck={toWordCards(packCards)}
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
    const [words, listRows, listItemRows, sentenceRows, officialRows] =
      await Promise.all([
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
            id: studySentences.id,
            listId: studySentences.listId,
            srsDueAt: studySentences.srsDueAt,
          })
          .from(studySentences)
          .where(eq(studySentences.learnerId, learner.id)),
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

    const decks: DeckSummary[] = [
      {
        id: "all",
        name: "All words",
        href: "/decks?book=all",
        totalWords: words.length,
        dueCount: totalDue,
        art: "liked",
      },
      ...listRows.map((list) => {
        const memberIds = listItemRows
          .filter((row) => row.listId === list.id)
          .map((row) => row.vocabId);
        return {
          id: list.id,
          name: list.name,
          href: `/decks?book=${list.id}`,
          totalWords: memberIds.length,
          dueCount: memberIds.filter((id) => dueById.get(id)).length,
          art: "book" as const,
        };
      }),
    ];

    // Sentence decks are their OWN shelf, not rows mixed in with the
    // word books: the two ask different questions, and a learner
    // choosing "what shall I drill" is choosing between them first.
    const sentenceDue = sentenceRows.filter((s) =>
      isCardDue(s.srsDueAt, now),
    ).length;
    const sentenceDecks: DeckSummary[] =
      sentenceRows.length === 0
        ? []
        : [
            {
              id: "sentences-all",
              name: "All sentences",
              href: "/decks?sentences=all",
              totalWords: sentenceRows.length,
              dueCount: sentenceDue,
              art: "sentences",
            },
            ...listRows
              .map((list) => {
                const scoped = sentenceRows.filter((s) => s.listId === list.id);
                return {
                  id: `sentences-${list.id}`,
                  name: list.name,
                  href: `/decks?sentences=${list.id}`,
                  totalWords: scoped.length,
                  dueCount: scoped.filter((s) => isCardDue(s.srsDueAt, now))
                    .length,
                  art: "sentences" as const,
                };
              })
              .filter((deck) => deck.totalWords > 0),
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
            { href: "/decks", label: "My decks", active: true },
            { href: "/official", label: "Official", active: false },
          ]}
        />

        <div className="max-w-3xl">
          {words.length === 0 ? (
            <DeckShelfEmpty />
          ) : (
            <>
              <h2 className="mb-2 text-[1rem] font-semibold">Word decks</h2>
              <DeckShelf decks={decks} />

              <h2 className="mt-8 mb-2 text-[1rem] font-semibold">
                Sentence decks
              </h2>
              {sentenceDecks.length > 0 ? (
                <DeckShelf decks={sentenceDecks} />
              ) : (
                // Not an empty shelf: the feature is invisible until
                // someone makes the first card, so the absence has to
                // say what it is and how to get one.
                <div className="rounded-xl bg-surface px-5 py-6 text-center shadow-card">
                  <p className="text-[0.9375rem] font-medium">
                    No sentence cards yet
                  </p>
                  <p className="mx-auto mt-1 max-w-md text-[0.875rem] text-fg-tertiary">
                    A sentence card blanks out one word inside a real sentence —
                    knowing what a word means and being able to supply it are
                    different skills, and only one of them is speaking.
                  </p>
                  <Link
                    href="/sentences"
                    className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3.5 text-[0.9375rem] font-medium text-white transition-colors hover:bg-accent-hover"
                  >
                    <MessageSquareQuote className="size-3.5" />
                    Make sentence cards
                  </Link>
                </div>
              )}
            </>
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
      <BackLink href="/decks">All decks</BackLink>
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
              href={`/books?book=${list.id}`}
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
          deck={toWordCards(deck)}
          totalWords={totalWords}
          listId={list?.id ?? null}
        />
      </div>
    </PageShell>
  );
}
