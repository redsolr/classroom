import Link from "next/link";
import { Play, Sparkles } from "lucide-react";
import {
  BookTile,
  LikedCover,
  SentenceCover,
} from "@/components/study/study-covers";

export type DeckSummary = {
  id: string;
  name: string;
  /** Where pressing this deck goes — word decks and sentence decks live
   * on different query params, so the row carries its own destination
   * instead of the shelf guessing from the id. */
  href: string;
  totalWords: number;
  dueCount: number;
  /** Which tile to wear. "liked" and "sentences" are fixed app-level
   * covers; "book" generates one from the name. */
  art: "liked" | "book" | "sentences";
};

/** A deck's one-line status. Sentence decks count CARDS, not words —
 * calling a sentence card a "word" would be the kind of small lie that
 * makes people stop trusting the numbers. */
function deckMeta(deck: DeckSummary): string {
  const unit = deck.art === "sentences" ? "card" : "word";
  const size = `${deck.totalWords} ${unit}${deck.totalWords === 1 ? "" : "s"}`;
  if (deck.dueCount > 0) return `${deck.dueCount} due · ${size}`;
  if (deck.totalWords === 0) return `Empty — no ${unit}s yet`;
  return `All caught up · ${size}`;
}

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
            href={deck.href}
            className="flex items-center gap-3.5 px-3 py-3 transition-colors hover:bg-surface-hover sm:px-4"
          >
            {deck.art === "liked" ? (
              <LikedCover className="w-12 shrink-0 sm:w-14" />
            ) : deck.art === "sentences" ? (
              <SentenceCover className="w-12 shrink-0 sm:w-14" />
            ) : (
              <BookTile name={deck.name} className="w-12 shrink-0 sm:w-14" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.9375rem] font-semibold">
                {deck.name}
              </span>
              <span className="block text-[0.8125rem] text-fg-tertiary">
                {deckMeta(deck)}
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
