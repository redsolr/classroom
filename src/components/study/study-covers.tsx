import * as React from "react";
import { Heart, MessageSquare, Quote } from "lucide-react";
import { coverHue } from "@/components/study/book-cover";
import { cn } from "@/lib/utils";

/**
 * Cover art for the learner's OWN collections.
 *
 * Two shapes, deliberately different, because they're two different
 * kinds of thing (the same split a music app makes between a playlist
 * and an album):
 *
 *   square 1:1  — your books, All words, sentences. Things you assembled.
 *   3:4 volume  — official books (PackCover). Things we published.
 *
 * Everything is generated from the title, like BookCover: no stored
 * artwork, no external fetch, and a brand-new book looks right the
 * second it exists.
 */

/**
 * The shared tile: a square, clipped, white-on-gradient plate. Every
 * cover below is this plus its own fill and its own mark — keeping the
 * geometry in ONE place is what stops the shelf going ragged the day a
 * fourth collection type shows up.
 */
function CoverTile({
  name,
  background,
  className,
  children,
}: {
  /** Semantic class for this cover kind, so each stays addressable. */
  name: string;
  /** Any CSS background — a fixed gradient, or one derived from a title. */
  background: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        name,
        "relative flex aspect-square items-center justify-center overflow-hidden rounded-md text-white shadow-card",
        className,
      )}
      // A real cover keeps its own colors in both themes.
      style={{ background }}
    >
      {children}
    </div>
  );
}

/**
 * The liked tile — the one collection that isn't a book. Your
 * vocabulary IS the liked layer (a word is in it or it isn't), so it
 * gets the treatment Liked Songs gets: a FIXED violet gradient and a
 * heart, never a generated hue, so it's recognisable across the shelf.
 */
export function LikedCover({ className }: { className?: string }) {
  return (
    <CoverTile
      name="liked-cover"
      className={className}
      background="linear-gradient(135deg, #4f46e5 0%, #7c6cf5 45%, #b9c7f7 100%)"
    >
      <Heart aria-hidden className="size-[38%] fill-current" />
    </CoverTile>
  );
}

/**
 * The sentence deck's tile. A fixed amber gradient and a quote mark —
 * fixed, like the liked tile, because "sentences" is one thing in the
 * app, not one of the learner's collections. It has to be unmistakable
 * next to a wall of generated book covers.
 */
export function SentenceCover({ className }: { className?: string }) {
  return (
    <CoverTile
      name="sentence-cover"
      className={className}
      background="linear-gradient(135deg, #b45309 0%, #f59e0b 55%, #fcd34d 100%)"
    >
      <Quote aria-hidden className="size-[36%] fill-current" />
    </CoverTile>
  );
}

/**
 * A learner book's tile: the deterministic gradient plus the title's
 * first glyph, set big. The glyph (not a truncated title) is what makes
 * a grid of these scannable at tile size — you learn your own books by
 * their colour + letter the same way you learn album art.
 */
export function BookTile({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const hue = coverHue(name);
  // Intl.Segmenter would be the pedantic choice, but the first code
  // POINT is enough here: it keeps CJK and emoji whole, which is the
  // only case a naive charAt would break.
  const glyph = [...name.trim()][0] ?? "?";
  return (
    <CoverTile
      name="book-tile"
      className={className}
      background={`linear-gradient(140deg, hsl(${hue} 58% 46%) 0%, hsl(${(hue + 32) % 360} 52% 28%) 100%)`}
    >
      <span
        aria-hidden
        className="absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)",
          backgroundSize: "7px 7px",
        }}
      />
      <span className="relative text-[2rem] leading-none font-semibold drop-shadow-sm">
        {glyph}
      </span>
    </CoverTile>
  );
}

/**
 * A chat's tile. A conversation has no artwork of its own, so it gets
 * the same deterministic gradient treatment as a book with a speech
 * glyph instead of a letter — enough to make the recents row read as a
 * shelf rather than a text list wedged between two shelves.
 */
export function ChatTile({
  title,
  className,
}: {
  title: string;
  className?: string;
}) {
  const hue = coverHue(title);
  return (
    <CoverTile
      name="chat-tile"
      className={className}
      background={`linear-gradient(140deg, hsl(${hue} 42% 38%) 0%, hsl(${(hue + 24) % 360} 38% 22%) 100%)`}
    >
      <MessageSquare aria-hidden className="size-[32%]" />
    </CoverTile>
  );
}

/** What kind of artwork a collection wears. "liked" and "sentences" are
 * app-level things with fixed covers; a book generates its own. */
export type CollectionArt = "liked" | "book" | "sentences";

/**
 * Art for a collection, chosen by kind. The three-way switch existed
 * verbatim on the deck shelf and on Home — two places that both had to
 * be remembered the day a fourth collection type appears.
 */
export function CollectionCover({
  art,
  name,
  className,
}: {
  art: CollectionArt;
  /** Only read for "book" — the generated cover is keyed by title. */
  name: string;
  className?: string;
}) {
  if (art === "liked") return <LikedCover className={className} />;
  if (art === "sentences") return <SentenceCover className={className} />;
  return <BookTile name={name} className={className} />;
}
