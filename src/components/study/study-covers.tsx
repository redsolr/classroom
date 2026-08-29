import { Heart, Quote } from "lucide-react";
import { coverHue } from "@/components/study/book-cover";
import { cn } from "@/lib/utils";

/**
 * Cover art for the learner's OWN collections.
 *
 * Two shapes, deliberately different, because they're two different
 * kinds of thing (Spotify's own split between a playlist and an album):
 *
 *   square 1:1  — your books and All words. Collections you assembled.
 *   3:4 volume  — official books (PackCover). Things we published.
 *
 * Everything is generated from the title, like BookCover: no stored
 * artwork, no external fetch, and a brand-new book looks right the
 * second it exists.
 */

/**
 * The "Liked Songs" tile — the one collection that isn't a book. Your
 * vocabulary IS the liked layer (a word is in it or it isn't), so it
 * gets the same treatment Spotify gives Liked Songs: the fixed violet
 * gradient and a heart, never a generated hue, so it's recognisable
 * from across the shelf.
 */
export function LikedCover({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "liked-cover relative flex aspect-square items-center justify-center overflow-hidden rounded-md text-white shadow-card",
        className,
      )}
      style={{
        background:
          "linear-gradient(135deg, #4f46e5 0%, #7c6cf5 45%, #b9c7f7 100%)",
      }}
    >
      <Heart aria-hidden className="size-[38%] fill-current" />
    </div>
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
    <div
      className={cn(
        "book-tile relative flex aspect-square items-center justify-center overflow-hidden rounded-md text-white shadow-card",
        className,
      )}
      style={{
        background: `linear-gradient(140deg, hsl(${hue} 58% 46%) 0%, hsl(${(hue + 32) % 360} 52% 28%) 100%)`,
      }}
    >
      <span
        aria-hidden
        className="absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage:
            "radial-gradient(currentColor 1px, transparent 1px)",
          backgroundSize: "7px 7px",
        }}
      />
      <span className="relative text-[2rem] leading-none font-semibold drop-shadow-sm">
        {glyph}
      </span>
    </div>
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
    <div
      className={cn(
        "sentence-cover relative flex aspect-square items-center justify-center overflow-hidden rounded-md text-white shadow-card",
        className,
      )}
      style={{
        background:
          "linear-gradient(135deg, #b45309 0%, #f59e0b 55%, #fcd34d 100%)",
      }}
    >
      <Quote aria-hidden className="size-[36%] fill-current" />
    </div>
  );
}
