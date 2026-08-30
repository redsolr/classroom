"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  db,
  studyBooks,
  studyDeckItems,
  studyDecks,
  studyNotes,
  studyVocab,
} from "@/db";
import { requireLearner } from "@/lib/auth";
import { requireOwnBook, requireOwnDeck } from "@/lib/study-guards";
import { revalidateStudyTree } from "@/lib/study-revalidate";
import { generateAccessToken } from "@/lib/tokens";

/**
 * BOOKS — the container.
 *
 * A book holds decks (the word lists you drill), notes, and the fact of
 * whether you have read it. It is the app's ONE meaning of the word now:
 * `study_books` used to be the reading list while vocab lists were shown
 * as "Books", which is two things called the same thing in a product
 * whose stated rule is one word one meaning.
 *
 * Decks are the small unit and books are what hold several of them. The
 * relationship is deliberately loose in both directions — a deck can
 * have no book, and deleting a book frees its decks rather than
 * destroying them. Containers should never be able to take the contents
 * with them.
 */

const titleSchema = z.string().trim().min(1).max(200);

/**
 * Make a book. ONE creation path, whichever surface asked.
 *
 * `read` is what the reading list passes: adding a book from there means
 * "I read this", and a second action that differed only in that flag is
 * how two creation paths start disagreeing about defaults.
 */
export async function createStudyBook(formData: FormData): Promise<{
  id: string;
}> {
  const learner = await requireLearner();
  const parsed = z
    .object({
      title: titleSchema,
      author: z.string().trim().max(200).optional(),
      summary: z.string().trim().max(4000).optional(),
      read: z.coerce.boolean().optional(),
    })
    .parse({
      title: formData.get("title"),
      author: formData.get("author") || undefined,
      summary: formData.get("summary") || undefined,
      read: formData.get("read") || undefined,
    });

  const [book] = await db
    .insert(studyBooks)
    .values({
      learnerId: learner.id,
      title: parsed.title,
      author: parsed.author || null,
      summary: parsed.summary || null,
      readAt: parsed.read ? new Date() : null,
    })
    .returning({ id: studyBooks.id });

  revalidateStudyTree();
  revalidatePath("/books");
  revalidatePath("/reading");
  return { id: book.id };
}

export async function renameStudyBook(
  bookId: string,
  title: string,
): Promise<void> {
  const learner = await requireLearner();
  const book = await requireOwnBook(learner.id, bookId);

  await db
    .update(studyBooks)
    .set({ title: titleSchema.parse(title), updatedAt: new Date() })
    .where(eq(studyBooks.id, book.id));

  revalidateStudyTree();
  revalidatePath("/books");
  revalidatePath(`/books/${book.id}`);
}

export async function updateStudyBookDetails(
  bookId: string,
  formData: FormData,
): Promise<void> {
  const learner = await requireLearner();
  const book = await requireOwnBook(learner.id, bookId);

  const parsed = z
    .object({
      title: titleSchema,
      author: z.string().trim().max(200).optional(),
      summary: z.string().trim().max(4000).optional(),
    })
    .parse({
      title: formData.get("title"),
      author: formData.get("author") || undefined,
      summary: formData.get("summary") || undefined,
    });

  await db
    .update(studyBooks)
    .set({
      title: parsed.title,
      author: parsed.author || null,
      summary: parsed.summary || null,
      updatedAt: new Date(),
    })
    .where(eq(studyBooks.id, book.id));

  revalidateStudyTree();
  revalidatePath(`/books/${book.id}`);
}

export async function toggleStudyBookPin(bookId: string): Promise<void> {
  const learner = await requireLearner();
  const book = await requireOwnBook(learner.id, bookId);

  await db
    .update(studyBooks)
    .set({ pinned: !book.pinned, updatedAt: new Date() })
    .where(eq(studyBooks.id, book.id));

  revalidateStudyTree();
  revalidatePath("/books");
}

/**
 * Mark a book read, or un-mark it.
 *
 * The reading list is a FILTER over books now, not its own table — which
 * is the whole point of the merge: a book you read can carry the words
 * you took out of it, in a deck, beside your notes about it.
 */
export async function toggleStudyBookRead(bookId: string): Promise<void> {
  const learner = await requireLearner();
  const book = await requireOwnBook(learner.id, bookId);

  await db
    .update(studyBooks)
    .set({ readAt: book.readAt ? null : new Date(), updatedAt: new Date() })
    .where(eq(studyBooks.id, book.id));

  revalidatePath("/books");
  revalidatePath("/reading");
  revalidatePath(`/books/${book.id}`);
}

/**
 * Delete a book, keeping everything inside it.
 *
 * Both FKs are SET NULL, so the decks come loose and the notes become
 * standalone notes. Destroying a learner's words because they tidied up
 * a container would be the single most unforgivable data loss this app
 * could inflict — they may have been reviewing those cards for months.
 */
export async function deleteStudyBook(bookId: string): Promise<void> {
  const learner = await requireLearner();
  const book = await requireOwnBook(learner.id, bookId);

  await db.delete(studyBooks).where(eq(studyBooks.id, book.id));

  revalidateStudyTree();
  revalidatePath("/books");
  revalidatePath("/reading");
  // ONE destination, whichever surface deleted it. The page the caller
  // was on no longer exists, so leaving is not optional — and the books
  // shelf is where a deleted book's siblings are, including the reading
  // list, which is a filter over the same shelf.
  redirect("/books");
}

// ---------------------------------------------------------------------------
// Sharing — a revocable, read-only link.
// ---------------------------------------------------------------------------

/**
 * Turn the public link on (or mint a fresh one, revoking the old).
 *
 * The same shape as the student portal's token, deliberately: a
 * revocable capability URL is a pattern this codebase already has, tests
 * and knows the failure modes of, and inventing a second sharing
 * mechanism for the same job would double the surface where "who can see
 * this" can go wrong.
 *
 * READ-ONLY. Collaborative editing needs the realtime transport decision
 * that is still open (docs/realtime-collab.md), and a share link does
 * not have to wait for it.
 */
export async function shareStudyBook(bookId: string): Promise<{
  token: string;
}> {
  const learner = await requireLearner();
  const book = await requireOwnBook(learner.id, bookId);

  const token = generateAccessToken();
  await db
    .update(studyBooks)
    .set({ shareToken: token, updatedAt: new Date() })
    .where(eq(studyBooks.id, book.id));

  revalidatePath(`/books/${book.id}`);
  return { token };
}

export async function unshareStudyBook(bookId: string): Promise<void> {
  const learner = await requireLearner();
  const book = await requireOwnBook(learner.id, bookId);

  await db
    .update(studyBooks)
    .set({ shareToken: null, updatedAt: new Date() })
    .where(eq(studyBooks.id, book.id));

  revalidatePath(`/books/${book.id}`);
}

/**
 * Take someone else's shared book: a COPY, owned outright.
 *
 * Not a live link back. Two people studying the same material diverge
 * within a week — different words stick, different notes matter — and a
 * shared book that kept syncing would mean one person's pruning silently
 * deletes the other's cards. The copy is the honest model, and it is
 * what Anki's own sharing does.
 *
 * Review history is deliberately NOT copied: the recipient has not
 * reviewed anything yet, and starting them on someone else's schedule
 * would tell them they know words they have never seen.
 */
export async function copySharedBook(token: string): Promise<{ id: string }> {
  const learner = await requireLearner();
  const parsed = z.string().trim().min(10).max(200).parse(token);

  const source = await db.query.studyBooks.findFirst({
    where: eq(studyBooks.shareToken, parsed),
  });
  if (!source) throw new Error("That shared book is no longer available.");

  const [copy] = await db
    .insert(studyBooks)
    .values({
      learnerId: learner.id,
      title: source.title,
      author: source.author,
      summary: source.summary,
    })
    .returning({ id: studyBooks.id });

  const sourceDecks = await db
    .select()
    .from(studyDecks)
    .where(eq(studyDecks.bookId, source.id));

  for (const deck of sourceDecks) {
    const [newDeck] = await db
      .insert(studyDecks)
      .values({ learnerId: learner.id, bookId: copy.id, name: deck.name })
      .returning({ id: studyDecks.id });

    // The source deck's words, in the owner's order. Read through the
    // membership table — the words themselves are re-created below,
    // because a `study_vocab` row belongs to exactly one learner.
    const words = await db
      .select({
        language: studyVocab.language,
        term: studyVocab.term,
        reading: studyVocab.reading,
        meaning: studyVocab.meaning,
        example: studyVocab.example,
        category: studyVocab.category,
        position: studyDeckItems.position,
      })
      .from(studyDeckItems)
      .innerJoin(studyVocab, eq(studyVocab.id, studyDeckItems.vocabId))
      .where(eq(studyDeckItems.deckId, deck.id))
      .orderBy(studyDeckItems.position);
    if (words.length === 0) continue;

    // No SRS columns are carried across: the recipient has reviewed none
    // of this, and starting them mid-schedule would tell them they know
    // words they have never seen. Everything lands as `new`, which is
    // the truth.
    const created = await db
      .insert(studyVocab)
      .values(
        words.map((w) => ({
          learnerId: learner.id,
          language: w.language,
          term: w.term,
          reading: w.reading,
          meaning: w.meaning,
          example: w.example,
          category: w.category,
        })),
      )
      .returning({ id: studyVocab.id });

    await db.insert(studyDeckItems).values(
      created.map((row, position) => ({
        deckId: newDeck.id,
        vocabId: row.id,
        position,
      })),
    );
  }

  revalidateStudyTree();
  revalidatePath("/books");
  return { id: copy.id };
}

// ---------------------------------------------------------------------------
// Decks inside books.
// ---------------------------------------------------------------------------

/** File a deck into a book, or pull it out (null). */
export async function moveDeckToBook(
  deckId: string,
  bookId: string | null,
): Promise<void> {
  const learner = await requireLearner();
  const deck = await requireOwnDeck(learner.id, deckId);
  const book = bookId ? await requireOwnBook(learner.id, bookId) : null;

  await db
    .update(studyDecks)
    .set({ bookId: book?.id ?? null, updatedAt: new Date() })
    .where(eq(studyDecks.id, deck.id));

  revalidateStudyTree();
  revalidatePath("/books");
  revalidatePath("/decks");
}

/** Attach a loose note to a book, or free it. */
export async function moveNoteToBook(
  noteId: string,
  bookId: string | null,
): Promise<void> {
  const learner = await requireLearner();
  const id = z.string().uuid().parse(noteId);
  const book = bookId ? await requireOwnBook(learner.id, bookId) : null;

  const updated = await db
    .update(studyNotes)
    .set({ bookId: book?.id ?? null, updatedAt: new Date() })
    .where(and(eq(studyNotes.id, id), eq(studyNotes.learnerId, learner.id)))
    .returning({ id: studyNotes.id });
  if (updated.length === 0) throw new Error("Note not found");

  revalidatePath("/notes");
  revalidatePath("/books");
}
