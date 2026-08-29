import Link from "next/link";
import { Play, Sparkles } from "lucide-react";
import { BookTile, LikedCover } from "@/components/study/study-covers";

export type DeckSummary = {
  /** "all" = the whole vocabulary; otherwise a book id. */
  id: string;
  name: string;
  totalWords: number;
  dueCount: number;
};

/**
 * The DECK SHELF — what /vocab/review opens on.
 *
 * It used to deal a card the moment you arrived, which meant the drill
 * chose the deck for you: there was no way to see that three books were
 * waiting, or to pick the one you're actually in the mood for. Same
 * shape as a music library now: every deck is a row with its cover, its
 * size, and how much is waiting, and you press play on the one you want.
 *
 * "All words" leads because it's the liked layer — every word you've
 * ever saved, regardless of which book filed it.
 */
export function DeckShelf({ decks }: { decks: DeckSummary[] }) {
  return (
    <ul className="deck-shelf divide-y divide-border overflow-hidden rounded-xl bg-surface shadow-card">
      {decks.map((deck) => (
        <li key={deck.id} className="deck-row group">
          <Link
            href={`/vocab/review?book=${deck.id}`}
            className="flex items-center gap-3.5 px-3 py-3 transition-colors hover:bg-surface-hover sm:px-4"
          >
            {deck.id === "all" ? (
              <LikedCover className="w-12 shrink-0 sm:w-14" />
            ) : (
              <BookTile name={deck.name} className="w-12 shrink-0 sm:w-14" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.9375rem] font-semibold">
                {deck.name}
              </span>
              <span className="block text-[0.8125rem] text-fg-tertiary">
                {deck.dueCount > 0
                  ? `${deck.dueCount} due · ${deck.totalWords} word${deck.totalWords === 1 ? "" : "s"}`
                  : deck.totalWords === 0
                    ? "Empty — no words yet"
                    : `All caught up · ${deck.totalWords} word${deck.totalWords === 1 ? "" : "s"}`}
              </span>
            </span>
            {deck.dueCount > 0 && (
              <span className="deck-due-pill shrink-0 rounded-full bg-practice px-2.5 py-1 text-[0.75rem] font-semibold text-white">
                {deck.dueCount}
              </span>
            )}
            {/* The play affordance appears on hover like a track row's
                does; on touch there's no hover, so it stays visible. */}
            <span
              aria-hidden
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-practice text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-lg:opacity-100"
            >
              <Play className="size-4 fill-current" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Nothing saved yet — point at the two ways to get words, rather than
 * rendering an empty shelf that looks broken. */
export function DeckShelfEmpty() {
  return (
    <div className="deck-shelf-empty rounded-xl bg-surface px-5 py-8 text-center shadow-card">
      <p className="text-[0.9375rem] font-medium">No decks yet</p>
      <p className="mx-auto mt-1 max-w-sm text-[0.875rem] text-fg-tertiary">
        A deck is a book you drill. Save some words — or take an official
        book — and they show up here, scheduled.
      </p>
      <Link
        href="/packs"
        className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3.5 text-[0.9375rem] font-medium text-white transition-colors hover:bg-accent-hover"
      >
        <Sparkles className="size-3.5" />
        Browse official books
      </Link>
    </div>
  );
}
