import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";
import { BookOpen, Layers, Plus } from "lucide-react";
import { db, studyDeckItems, studyPackItems, studyPacks, studyVocab } from "@/db";
import { requireLearner } from "@/lib/auth";
import { loadBooks, loadDecks } from "@/lib/study-book-queries";
import { NewBookDialog } from "@/components/study/new-book-dialog";
import { OfficialShelf } from "@/components/study/official-shelf";
import { Shelf, ShelfCard } from "@/components/study/shelf";
import { BookTile, LikedCover } from "@/components/study/study-covers";
import { VocabShelf } from "@/components/study/vocab-shelf";
import type { DeckSummaryRow } from "@/components/study/vocab-table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, PageShell } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Books" };

/**
 * BOOKS — the shelf of containers.
 *
 * This page used to list DECKS and call them books, which is the
 * confusion the 2026-08-30 merge exists to end. A book holds decks, notes
 * and whether you read it; a deck is the word list you drill.
 *
 * "All words" still leads, and it is not a book — it is the liked layer,
 * every word you ever saved regardless of where it was filed. It gets
 * the fixed violet heart tile for the same reason it always did: it is
 * the one row that is not a collection you made.
 */
export default async function StudyBooksPage({
  searchParams,
}: {
  searchParams: Promise<{ book?: string }>;
}) {
  const learner = await requireLearner();
  const { book } = await searchParams;

  /**
   * `?book=<id>` was how a DECK's word table was reached before decks
   * had a page of their own. Bookmarks and the sidebar's pinned rows
   * still carry it, so it redirects rather than 404s — the same promise
   * the 2026-08-29 URL rename made, and 307 for the same reason: a
   * permanent redirect is cached forever and would outlive our ability
   * to change our minds.
   */
  if (book) redirect(`/decks/${book}`);

  const [books, decks, membership, officialRows] = await Promise.all([
    loadBooks(learner.id),
    loadDecks(learner.id),
    db
      .select({
        deckId: studyDeckItems.deckId,
        vocabId: studyDeckItems.vocabId,
      })
      .from(studyDeckItems)
      .innerJoin(studyVocab, eq(studyVocab.id, studyDeckItems.vocabId))
      .where(eq(studyVocab.learnerId, learner.id))
      .orderBy(studyDeckItems.deckId, studyDeckItems.position),
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

  const byDeck = new Map<string, string[]>();
  for (const row of membership) {
    const bucket = byDeck.get(row.deckId);
    if (bucket) bucket.push(row.vocabId);
    else byDeck.set(row.deckId, [row.vocabId]);
  }

  const deckRows: DeckSummaryRow[] = decks.map((deck) => ({
    id: deck.id,
    name: deck.name,
    pinned: deck.pinned,
    isDefault: deck.isDefault,
    itemIds: byDeck.get(deck.id) ?? [],
  }));

  // Every word once, however many decks file it — the liked layer is a
  // set, and summing deck sizes would count a word in two decks twice.
  const totalWords = new Set(membership.map((m) => m.vocabId)).size;

  return (
    <PageShell width="wide">
      <PageHeader
        icon={Layers}
        title="Books"
        subtitle="A book holds the decks you drill and the notes you take. Decks are the word lists; everything else lives around them."
        actions={
          <NewBookDialog>
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-surface px-3.5 text-[0.9375rem] font-medium shadow-card transition-colors hover:bg-surface-hover"
            >
              <Plus className="size-4 text-fg-tertiary" />
              New book
            </button>
          </NewBookDialog>
        }
      />

      <div className="space-y-10">
        <Shelf title="Your books" className="books-shelf">
          {/* Not a book — the liked layer. Every word you ever saved,
              whichever deck filed it. */}
          <ShelfCard
            href="/decks/all"
            name="All words"
            detail={`${totalWords} word${totalWords === 1 ? "" : "s"}`}
            cover={<LikedCover />}
          />
          {books.map((b) => (
            <ShelfCard
              key={b.id}
              href={`/books/${b.id}`}
              name={b.title}
              detail={[
                `${b.decks.length} deck${b.decks.length === 1 ? "" : "s"}`,
                b.noteCount > 0 &&
                  `${b.noteCount} note${b.noteCount === 1 ? "" : "s"}`,
                b.readAt && "read",
              ]
                .filter(Boolean)
                .join(" · ")}
              badge={b.dueCount > 0 ? `${b.dueCount} due` : undefined}
              cover={<BookTile name={b.title} />}
            />
          ))}
        </Shelf>

        {/* THE DECKS THEMSELVES, with their management menus. Books
            are containers; this is what is actually in them, including
            the decks that aren't in one — a loose deck is legal and has
            to be reachable or it is simply lost. */}
        <section>
          <h2 className="mb-3 text-[1.5rem] font-bold tracking-tight">
            Your decks
          </h2>
          <VocabShelf lists={deckRows} totalWords={totalWords} />
        </section>

        {books.length === 0 && decks.length === 0 && (
          <EmptyState
            icon={<BookOpen />}
            title="No books yet"
            description="Take an official book below, or make one of your own and put a deck in it."
            action={
              <Link
                href="/official"
                className="inline-flex h-9 items-center rounded-md bg-accent px-3.5 text-[0.9375rem] font-medium text-white"
              >
                Browse official books
              </Link>
            }
          />
        )}

        <OfficialShelf items={officialRows} />
      </div>
    </PageShell>
  );
}
