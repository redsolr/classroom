import { and, eq, isNull, sql } from "drizzle-orm";
import {
  db,
  studyBooks,
  studyDeckItems,
  studyDecks,
  studyNotes,
  studyVocab,
  type StudyBook,
  type StudyDeck,
} from "@/db";
import { isCardDue } from "@/lib/srs";
import { membersByDeck } from "@/lib/study-shelves";

/**
 * Reading books and the decks inside them.
 *
 * One place, because "how many words are in this book" is a two-hop
 * question (book → decks → members) that three surfaces need — the
 * shelf, the book page and the sidebar — and three inline versions is
 * three chances for the count to mean subtly different things.
 */

/**
 * What the vocab table needs to know about every deck: enough to offer
 * "file this word into…" and to say which decks already hold it.
 *
 * Declared HERE rather than on the component that consumes it, because
 * it is the shape of a query result — a server module importing a type
 * out of a `"use client"` file to describe its own return value has the
 * dependency the wrong way round.
 */
export type DeckSummaryRow = {
  id: string;
  name: string;
  pinned: boolean;
  isDefault: boolean;
  /** Member vocab ids, in the learner's manual order. */
  itemIds: string[];
};

export type DeckSummary = StudyDeck & {
  wordCount: number;
  dueCount: number;
  /** Every card in it has been mastered — see `isPlatinum`. */
  platinum: boolean;
};

export type BookSummary = StudyBook & {
  decks: DeckSummary[];
  noteCount: number;
  wordCount: number;
  dueCount: number;
};

/**
 * PLATINUM — the deck is finished.
 *
 * "Drilled it to 100 percent" resolved to: every card in the deck has
 * reached `mastered`, which is itself derived from review evidence
 * (`deriveVocabularyStatus`) rather than asserted. So the trophy cannot
 * be farmed by a good day — it takes the schedule actually carrying each
 * card out to a long interval, which is the same thing as knowing them.
 *
 * An EMPTY deck is never platinum. "All zero of your cards are mastered"
 * is technically true and would hand out a trophy for creating a deck,
 * which is exactly the kind of hollow reward that teaches people to stop
 * believing the others.
 */
export function isPlatinum(
  cards: { status: string }[],
): boolean {
  return cards.length > 0 && cards.every((c) => c.status === "mastered");
}

/** Decks with their counts, for one learner. */
export async function loadDecks(
  learnerId: string,
  now = new Date(),
): Promise<DeckSummary[]> {
  const [decks, members] = await Promise.all([
    db
      .select()
      .from(studyDecks)
      .where(eq(studyDecks.learnerId, learnerId))
      .orderBy(studyDecks.createdAt),
    db
      .select({
        deckId: studyDeckItems.deckId,
        status: studyVocab.status,
        srsDueAt: studyVocab.srsDueAt,
      })
      .from(studyDeckItems)
      .innerJoin(studyVocab, eq(studyVocab.id, studyDeckItems.vocabId))
      .where(eq(studyVocab.learnerId, learnerId)),
  ]);

  const byDeck = new Map<string, { status: string; srsDueAt: Date | null }[]>();
  for (const row of members) {
    const bucket = byDeck.get(row.deckId);
    if (bucket) bucket.push(row);
    else byDeck.set(row.deckId, [row]);
  }

  return decks.map((deck) => {
    const cards = byDeck.get(deck.id) ?? [];
    return {
      ...deck,
      wordCount: cards.length,
      dueCount: cards.filter((c) => isCardDue(c.srsDueAt, now)).length,
      platinum: isPlatinum(cards),
    };
  });
}

/** Books with their decks and note counts. */
export async function loadBooks(
  learnerId: string,
  now = new Date(),
): Promise<BookSummary[]> {
  const [books, decks, noteRows] = await Promise.all([
    db
      .select()
      .from(studyBooks)
      .where(eq(studyBooks.learnerId, learnerId))
      .orderBy(studyBooks.createdAt),
    loadDecks(learnerId, now),
    db
      .select({
        bookId: studyNotes.bookId,
        count: sql<number>`count(*)::int`,
      })
      .from(studyNotes)
      .where(eq(studyNotes.learnerId, learnerId))
      .groupBy(studyNotes.bookId),
  ]);

  const notesByBook = new Map(
    noteRows.filter((r) => r.bookId).map((r) => [r.bookId!, r.count]),
  );

  return books.map((book) => {
    const own = decks.filter((d) => d.bookId === book.id);
    return {
      ...book,
      decks: own,
      noteCount: notesByBook.get(book.id) ?? 0,
      wordCount: own.reduce((sum, d) => sum + d.wordCount, 0),
      dueCount: own.reduce((sum, d) => sum + d.dueCount, 0),
    };
  });
}

/**
 * Every deck as the vocab table wants it, plus the size of the liked
 * layer — the two things `/books` and `/decks/<id>` both need before
 * they can draw a word table.
 *
 * Both pages ran this same query and rebuilt the same map inline, and
 * `/decks/<id>` did it in a second round-trip after its first await. One
 * function, one round-trip, one answer to "which words are in which
 * deck" — which is the question `membersByDeck` was extracted for in the
 * first place and which both callers had quietly re-implemented.
 */
export async function deckSummaryRows(learnerId: string): Promise<{
  rows: DeckSummaryRow[];
  /** Distinct words the learner has saved, however many decks file them. */
  totalWords: number;
}> {
  const [decks, membership] = await Promise.all([
    db
      .select()
      .from(studyDecks)
      .where(eq(studyDecks.learnerId, learnerId))
      .orderBy(studyDecks.createdAt),
    db
      .select({
        deckId: studyDeckItems.deckId,
        vocabId: studyDeckItems.vocabId,
      })
      .from(studyDeckItems)
      .innerJoin(studyVocab, eq(studyVocab.id, studyDeckItems.vocabId))
      .where(eq(studyVocab.learnerId, learnerId))
      .orderBy(studyDeckItems.deckId, studyDeckItems.position),
  ]);

  const members = membersByDeck(membership);
  return {
    rows: decks.map((deck) => ({
      id: deck.id,
      name: deck.name,
      pinned: deck.pinned,
      isDefault: deck.isDefault,
      itemIds: members.get(deck.id) ?? [],
    })),
    // A SET, because summing deck sizes counts a word filed in two decks
    // twice — the liked layer is a set, not a total.
    totalWords: new Set(membership.map((m) => m.vocabId)).size,
  };
}

/** Decks with no book — still legal, and they need somewhere to appear. */
export async function looseDecks(
  learnerId: string,
  now = new Date(),
): Promise<DeckSummary[]> {
  const decks = await loadDecks(learnerId, now);
  return decks.filter((d) => d.bookId === null);
}

/** One book with everything inside it, or null if it isn't theirs. */
export async function loadBook(
  learnerId: string,
  bookId: string,
  now = new Date(),
): Promise<(BookSummary & { notes: { id: string; content: string; createdAt: Date }[] }) | null> {
  const book = await db.query.studyBooks.findFirst({
    where: and(eq(studyBooks.id, bookId), eq(studyBooks.learnerId, learnerId)),
  });
  if (!book) return null;

  const [decks, notes] = await Promise.all([
    loadDecks(learnerId, now),
    db
      .select({
        id: studyNotes.id,
        content: studyNotes.content,
        createdAt: studyNotes.createdAt,
      })
      .from(studyNotes)
      .where(
        and(eq(studyNotes.learnerId, learnerId), eq(studyNotes.bookId, book.id)),
      )
      .orderBy(studyNotes.createdAt),
  ]);

  const own = decks.filter((d) => d.bookId === book.id);
  return {
    ...book,
    decks: own,
    notes,
    noteCount: notes.length,
    wordCount: own.reduce((sum, d) => sum + d.wordCount, 0),
    dueCount: own.reduce((sum, d) => sum + d.dueCount, 0),
  };
}

/**
 * A shared book, by its token — for the PUBLIC page.
 *
 * No learner id, on purpose: this is the one read path that anonymous
 * callers reach, and the token IS the authorization. It returns only
 * what the page shows, so a future column on `study_books` cannot leak
 * by being added.
 */
export async function loadSharedBook(token: string): Promise<{
  title: string;
  author: string | null;
  summary: string | null;
  ownerName: string | null;
  decks: { id: string; name: string; words: { term: string; reading: string | null; meaning: string | null }[] }[];
  notes: { id: string; content: string }[];
} | null> {
  const book = await db.query.studyBooks.findFirst({
    where: eq(studyBooks.shareToken, token),
  });
  if (!book) return null;

  const owner = await db.query.learners.findFirst({
    where: (l, { eq: is }) => is(l.id, book.learnerId),
    columns: { name: true },
  });

  const decks = await db
    .select({ id: studyDecks.id, name: studyDecks.name })
    .from(studyDecks)
    .where(eq(studyDecks.bookId, book.id))
    .orderBy(studyDecks.createdAt);

  const withWords = [];
  for (const deck of decks) {
    const words = await db
      .select({
        term: studyVocab.term,
        reading: studyVocab.reading,
        meaning: studyVocab.meaning,
      })
      .from(studyDeckItems)
      .innerJoin(studyVocab, eq(studyVocab.id, studyDeckItems.vocabId))
      .where(eq(studyDeckItems.deckId, deck.id))
      .orderBy(studyDeckItems.position);
    withWords.push({ ...deck, words });
  }

  const notes = await db
    .select({ id: studyNotes.id, content: studyNotes.content })
    .from(studyNotes)
    .where(eq(studyNotes.bookId, book.id))
    .orderBy(studyNotes.createdAt);

  return {
    title: book.title,
    author: book.author,
    summary: book.summary,
    ownerName: owner?.name ?? null,
    decks: withWords,
    notes,
  };
}

/** Books the learner has marked read — the reading list, as a filter. */
export async function readBooks(learnerId: string): Promise<StudyBook[]> {
  return db
    .select()
    .from(studyBooks)
    .where(
      and(eq(studyBooks.learnerId, learnerId), sql`${studyBooks.readAt} is not null`),
    )
    .orderBy(studyBooks.readAt);
}

/** Notes with no book — the standalone Notes tab. */
export async function looseNotes(learnerId: string) {
  return db
    .select({
      id: studyNotes.id,
      content: studyNotes.content,
      createdAt: studyNotes.createdAt,
    })
    .from(studyNotes)
    .where(and(eq(studyNotes.learnerId, learnerId), isNull(studyNotes.bookId)))
    .orderBy(studyNotes.createdAt);
}
