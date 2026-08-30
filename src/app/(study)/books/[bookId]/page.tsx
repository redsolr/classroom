import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BookOpenCheck,
  Check,
  NotebookPen,
  Play,
  Plus,
  Trophy,
} from "lucide-react";
import { requireLearner } from "@/lib/auth";
import { loadBook } from "@/lib/study-book-queries";
import { toggleStudyBookRead } from "@/lib/actions/books";
import { BookMenu } from "@/components/study/book-menu";
import { BookShareCard } from "@/components/study/book-share-card";
import { BookTile } from "@/components/study/study-covers";
import { CollectionHero, PlayAction } from "@/components/study/collection-hero";
import { NewDeckDialog } from "@/components/study/new-deck-dialog";
import { SubmitButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { BackLink, Card, CardHeader, PageShell } from "@/components/ui/page-header";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ bookId: string }>;
}): Promise<Metadata> {
  const learner = await requireLearner();
  const { bookId } = await params;
  const book = await loadBook(learner.id, bookId);
  return { title: book?.title ?? "Book" };
}

/**
 * ONE BOOK — its decks, its notes, and whether you've read it.
 *
 * The three things a book holds, in the order they matter: what you can
 * drill, what you wrote down, and the fact of having read it. A book
 * with no decks is still a book — plenty of reading produces notes and
 * no vocabulary — so the deck section can be empty without the page
 * looking broken.
 */
export default async function StudyBookPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const learner = await requireLearner();
  const { bookId } = await params;
  const book = await loadBook(learner.id, bookId);
  if (!book) notFound();

  const platinumDecks = book.decks.filter((d) => d.platinum).length;

  return (
    <PageShell>
      <BackLink href="/books">Books</BackLink>

      <CollectionHero
        hueSeed={book.title}
        cover={<BookTile name={book.title} />}
        eyebrow="Book"
        title={book.title}
        meta={
          <>
            {book.author && `${book.author} · `}
            {book.decks.length} deck{book.decks.length === 1 ? "" : "s"}
            {book.wordCount > 0 && ` · ${book.wordCount} words`}
            {book.noteCount > 0 &&
              ` · ${book.noteCount} note${book.noteCount === 1 ? "" : "s"}`}
            {platinumDecks > 0 && ` · ${platinumDecks} mastered`}
          </>
        }
        actions={
          <>
            {book.dueCount > 0 && (
              <PlayAction href={`/decks?book=${book.decks[0]?.id ?? ""}`}>
                <Play className="size-4 fill-current" />
                Review {book.dueCount}
              </PlayAction>
            )}
            {/* Read is a FLAG on the container now, not a separate kind
                of thing — which is what lets a book you read carry the
                words you took out of it. */}
            <form action={toggleStudyBookRead.bind(null, book.id)}>
              <SubmitButton variant={book.readAt ? "ghost" : "secondary"}>
                {book.readAt ? (
                  <>
                    <Check className="size-4" />
                    Read
                  </>
                ) : (
                  "Mark as read"
                )}
              </SubmitButton>
            </form>
            <BookMenu
              bookId={book.id}
              title={book.title}
              pinned={book.pinned}
              deckCount={book.decks.length}
              noteCount={book.noteCount}
            />
          </>
        }
      />

      <div className="max-w-3xl space-y-5">
        {book.summary && (
          <p className="text-[0.9375rem] whitespace-pre-line text-fg-secondary">
            {book.summary}
          </p>
        )}

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <BookOpenCheck className="size-4 text-fg-tertiary" />
                Decks
              </span>
            }
            actions={
              <NewDeckDialog bookId={book.id}>
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-[0.875rem] text-fg-secondary transition-colors hover:text-fg"
                >
                  <Plus className="size-3.5" />
                  New deck
                </button>
              </NewDeckDialog>
            }
          />
          {book.decks.length === 0 ? (
            <p className="px-4 py-4 text-[0.875rem] text-fg-tertiary">
              No decks in this book yet. A deck is a list of words you can
              drill — add one, or file an existing deck in here from the
              Decks page.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {book.decks.map((deck) => (
                <li key={deck.id}>
                  <Link
                    href={`/decks/${deck.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-hover"
                  >
                    <BookTile name={deck.name} className="w-10 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[0.9375rem] font-semibold">
                          {deck.name}
                        </span>
                        {/* The trophy is the whole deck mastered — see
                            `isPlatinum`. An empty deck never earns it. */}
                        {deck.platinum && (
                          <Trophy
                            className="size-4 shrink-0 text-[hsl(43_74%_52%)]"
                            aria-label="Fully mastered"
                          />
                        )}
                      </span>
                      <span className="block text-[0.8125rem] text-fg-tertiary">
                        {deck.wordCount} word{deck.wordCount === 1 ? "" : "s"}
                        {deck.dueCount > 0 && ` · ${deck.dueCount} due`}
                      </span>
                    </span>
                    {deck.dueCount > 0 && (
                      <span className="shrink-0 rounded-full bg-practice px-2.5 py-1 text-[0.75rem] font-semibold text-white">
                        {deck.dueCount}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <NotebookPen className="size-4 text-fg-tertiary" />
                Notes
              </span>
            }
            actions={
              <Link
                href="/notes"
                className="text-[0.875rem] text-fg-secondary transition-colors hover:text-fg"
              >
                All notes
              </Link>
            }
          />
          {book.notes.length === 0 ? (
            <p className="px-4 py-4 text-[0.875rem] text-fg-tertiary">
              No notes yet. Ask the tutor about this book and tell it to
              save what's worth keeping — that's how most notes get
              written here.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {book.notes.map((note) => (
                <li
                  key={note.id}
                  className="px-4 py-3 text-[0.9375rem] whitespace-pre-line"
                >
                  {note.content}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <BookShareCard bookId={book.id} shareToken={book.shareToken} />

        {book.decks.length === 0 && book.notes.length === 0 && (
          <EmptyState
            title="This book is empty"
            description="Put a deck in it, or start a chat about it and let the tutor save the notes."
          />
        )}
      </div>
    </PageShell>
  );
}
