import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookOpen, GraduationCap } from "lucide-react";
import { loadSharedBook } from "@/lib/study-book-queries";
import { CopySharedBookButton } from "@/components/study/copy-shared-book";
import { BookTile } from "@/components/study/study-covers";
import { Card, CardHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "Shared book",
  // A capability URL must never be indexed: the token IS the
  // authorization, and a search engine that crawls it publishes it.
  robots: { index: false, follow: false },
};

/**
 * A SHARED BOOK — public, read-only, token-addressed.
 *
 * The one study surface anonymous callers reach, so it lives OUTSIDE the
 * `(study)` group: no sidebar, no learner resolution, no chrome that
 * assumes a signed-in person. `/b/<token>` mirrors the student portal's
 * `/p/<token>`, which is the same idea and the same trust model.
 *
 * The query returns only what this page renders (`loadSharedBook`), so a
 * column added to `study_books` later cannot leak by being added — the
 * shape is a whitelist, not a row.
 */
export default async function SharedBookPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const book = await loadSharedBook(token);
  // A revoked link and a link that never existed are indistinguishable
  // on purpose: telling someone "this used to exist" is information the
  // owner did not agree to share.
  if (!book) notFound();

  const wordCount = book.decks.reduce((n, d) => n + d.words.length, 0);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <header className="mb-8 flex flex-wrap items-start gap-4">
        <BookTile name={book.title} className="w-20 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[0.78rem] font-semibold tracking-wide text-fg-tertiary uppercase">
            Shared book
          </p>
          <h1 className="mt-1 text-[1.75rem] font-semibold tracking-tight">
            {book.title}
          </h1>
          <p className="mt-1 text-[0.9375rem] text-fg-secondary">
            {book.author && `${book.author} · `}
            {book.decks.length} deck{book.decks.length === 1 ? "" : "s"} ·{" "}
            {wordCount} word{wordCount === 1 ? "" : "s"}
            {book.ownerName && ` · shared by ${book.ownerName}`}
          </p>
        </div>
      </header>

      {book.summary && (
        <p className="mb-6 text-[0.9375rem] whitespace-pre-line text-fg-secondary">
          {book.summary}
        </p>
      )}

      <div className="mb-8">
        <CopySharedBookButton token={token} />
      </div>

      <div className="space-y-5">
        {book.decks.map((deck) => (
          <Card key={deck.id}>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <BookOpen className="size-4 text-fg-tertiary" />
                  {deck.name}
                </span>
              }
              actions={
                <span className="text-[0.8125rem] text-fg-tertiary">
                  {deck.words.length} word
                  {deck.words.length === 1 ? "" : "s"}
                </span>
              }
            />
            <ul className="divide-y divide-border">
              {deck.words.map((word, i) => (
                <li
                  key={`${deck.id}-${i}`}
                  className="flex flex-wrap items-baseline gap-x-3 px-4 py-2 text-[0.9375rem]"
                >
                  <span className="font-medium">{word.term}</span>
                  {word.reading && (
                    <span className="text-[0.875rem] text-fg-tertiary">
                      {word.reading}
                    </span>
                  )}
                  <span className="text-fg-secondary">{word.meaning}</span>
                </li>
              ))}
            </ul>
          </Card>
        ))}

        {book.notes.length > 0 && (
          <Card>
            <CardHeader title="Notes" />
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
          </Card>
        )}
      </div>

      <footer className="mt-10 flex items-center gap-2 border-t border-border pt-5 text-[0.875rem] text-fg-tertiary">
        <GraduationCap className="size-4" />
        Made with Classroom
      </footer>
    </main>
  );
}
