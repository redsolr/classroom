import { cn } from "@/lib/utils";

/**
 * Generated book cover — a deterministic gradient from the title plus
 * typography, Notion-style. No stored artwork, no external fetch: HBR
 * articles have no cover art anyway, and the shelf still reads as a
 * shelf. Server-renderable (no hooks).
 */

/** Deterministic 0–359 hue from a seed string — shared with the review
 * deck, which keys it by LANGUAGE so every Japanese card wears the same
 * tint everywhere in the app. */
export function coverHue(title: string): number {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) | 0;
  }
  return ((hash % 360) + 360) % 360;
}

export function BookCover({
  title,
  author,
  className,
}: {
  title: string;
  author?: string | null;
  className?: string;
}) {
  const hue = coverHue(title);
  return (
    <div
      className={cn(
        "book-cover relative flex aspect-[3/4] flex-col justify-between overflow-hidden rounded-md p-3 text-white shadow-card",
        className,
      )}
      // A real cover keeps its own colors in both themes.
      style={{
        background: `linear-gradient(160deg, hsl(${hue} 52% 42%) 0%, hsl(${(hue + 38) % 360} 55% 26%) 100%)`,
      }}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-1.5 w-px bg-white/25"
      />
      <span className="line-clamp-4 text-[0.9375rem] font-semibold leading-snug">
        {title}
      </span>
      {author && (
        <span className="line-clamp-2 text-[0.75rem] text-white/75">
          {author}
        </span>
      )}
    </div>
  );
}
