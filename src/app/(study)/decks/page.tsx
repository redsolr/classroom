import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpenCheck, MessageSquareQuote, Undo2 } from "lucide-react";
import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import {
  db,
  studyPackItems,
  studyPacks,
  studySentences,
  studyVocab,
  studyDeckItems,
  studyDecks,
} from "@/db";
import { requireLearner } from "@/lib/auth";
import { loadErrorDeck } from "@/lib/error-deck";
import { isCardDue } from "@/lib/srs";
import { wordCardColumns } from "@/lib/study-decks";
import { dueIds, membersByDeck } from "@/lib/study-shelves";
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
  searchParams: Promise<{
    book?: string;
    pack?: string;
    sentences?: string;
    errors?: string;
  }>;
}) {
  const learner = await requireLearner();
  const { book, pack, sentences, errors } = await searchParams;

  /**
   * ── The ERROR deck ──
   *
   * Only the cards whose most recent answer was "again". The single
   * highest-value drill there is, and the one Anki makes you build a
   * filtered deck by hand for: a due deck is mostly cards arriving on
   * schedule that you already know, and the ones you actually failed are
   * scattered through it.
   *
   * Graded for REAL, not as a cram round — the schedule has already been
   * told about these cards, and the whole point of drilling them is that
   * getting one right now moves it.
   */
  if (errors) {
    const cards = await loadErrorDeck(
      learner.id,
      errors === "all" ? null : errors,
    );
    return (
      <PageShell>
        <BackLink href="/decks">All decks</BackLink>
        <PageHeader
          icon={BookOpenCheck}
          title="Cards you got wrong"
          subtitle="The ones you missed most recently. Getting one right here moves it back into the schedule."
        />
        <StudyReview
          deck={toWordCards(cards)}
          totalWords={cards.length}
          deckId={errors === "all" ? null : errors}
        />
      </PageShell>
    );
  }

  // ── Sentence deck ──
  // The same stack, the same swipes, the same scheduler — a different
  // question. `?sentences=all` draws from every sentence card; a book id
  // narrows to the ones generated from that book.
  if (sentences) {
    const list =
      sentences !== "all"
        ? await db.query.studyDecks.findFirst({
            where: and(
              eq(studyDecks.id, sentences),
              eq(studyDecks.learnerId, learner.id),
            ),
          })
        : null;
    if (sentences !== "all" && !list) notFound();

    const scope = and(
      eq(studySentences.learnerId, learner.id),
      list ? eq(studySentences.deckId, list.id) : undefined,
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
            deckId={list?.id ?? null}
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
          .select({ id: studyDecks.id, name: studyDecks.name })
          .from(studyDecks)
          .where(eq(studyDecks.learnerId, learner.id))
          .orderBy(asc(studyDecks.createdAt)),
        db
          .select({
            deckId: studyDeckItems.deckId,
            vocabId: studyDeckItems.vocabId,
          })
          .from(studyDeckItems)
          .innerJoin(
            studyDecks,
            eq(studyDeckItems.deckId, studyDecks.id),
          )
          .where(eq(studyDecks.learnerId, learner.id)),
        db
          .select({
            id: studySentences.id,
            deckId: studySentences.deckId,
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

    const dueWordIds = dueIds(words, now);
    const totalDue = dueWordIds.size;
    const errorCards = await loadErrorDeck(learner.id);
    const members = membersByDeck(listItemRows);

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
        const memberIds = members.get(list.id) ?? [];
        return {
          id: list.id,
          name: list.name,
          href: `/decks?book=${list.id}`,
          totalWords: memberIds.length,
          dueCount: memberIds.filter((id) => dueWordIds.has(id)).length,
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
                const scoped = sentenceRows.filter((s) => s.deckId === list.id);
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
      <PageShell width="wide">
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

        {/* Above the shelves, because when it has anything in it, it is
            the most useful thing on the page — and because it empties
            itself, so it is absent far more often than not. */}
        {errorCards.length > 0 && (
          <Link
            href="/decks?errors=all"
            className="deck-error-entry mb-6 flex items-center gap-3 rounded-xl bg-surface px-4 py-3.5 shadow-card transition-colors hover:bg-surface-hover"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
              <Undo2 className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[0.9375rem] font-semibold">
                Cards you got wrong
              </span>
              <span className="block text-[0.8125rem] text-fg-tertiary">
                {errorCards.length} card
                {errorCards.length === 1 ? "" : "s"} you missed recently —
                the ones worth another look
              </span>
            </span>
            <span className="shrink-0 rounded-full bg-danger-soft px-2.5 py-1 text-[0.75rem] font-semibold text-danger">
              {errorCards.length}
            </span>
          </Link>
        )}

        <div>
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
        <div className="mt-10">
          <OfficialShelf items={officialRows} />
        </div>
      </PageShell>
    );
  }

  // `?book=` makes a book an actual study unit instead of a pure
  // grouping: same SM-2 schedule and the same rows, just a narrower
  // draw. `?book=all` draws from the whole vocabulary.
  const list =
    book !== "all"
      ? await db.query.studyDecks.findFirst({
          where: and(
            eq(studyDecks.id, book),
            eq(studyDecks.learnerId, learner.id),
          ),
        })
      : null;
  if (book !== "all" && !list) notFound();

  const due = or(
    isNull(studyVocab.srsDueAt),
    lte(studyVocab.srsDueAt, new Date()),
  );
  // Never-reviewed cards first (srsDueAt null), then most-overdue.
  const deckQuery = list
    ? db
        .select(wordCardColumns)
        .from(studyVocab)
        .innerJoin(
          studyDeckItems,
          eq(studyDeckItems.vocabId, studyVocab.id),
        )
        .where(
          and(
            eq(studyVocab.learnerId, learner.id),
            eq(studyDeckItems.deckId, list.id),
            due,
          ),
        )
        .orderBy(sql`${studyVocab.srsDueAt} asc nulls first`)
        .limit(50)
    : db
        .select(wordCardColumns)
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
          studyDeckItems,
          eq(studyDeckItems.vocabId, studyVocab.id),
        )
        .where(
          and(
            eq(studyVocab.learnerId, learner.id),
            eq(studyDeckItems.deckId, list.id),
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
              href={`/decks/${list.id}`}
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
          deckId={list?.id ?? null}
        />
      </div>
    </PageShell>
  );
}
