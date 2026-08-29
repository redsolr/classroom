import { coverHue } from "@/components/study/book-cover";
import { cn } from "@/lib/utils";

/**
 * Generated tankōbon cover for a curated pack — a signature glyph, the
 * title set vertically like a manga spine, and a screentone wash over a
 * deterministic gradient.
 *
 * Same doctrine as the library's BookCover: generated, never stored, and
 * deliberately nothing that reproduces a real published cover. The art
 * is OURS — a kanji the pack's vocabulary actually teaches, not a logo.
 */

type PackArt = {
  /** The hero character — big, centred, carries the whole cover. */
  glyph: string;
  /** Spine text, set vertically. Kept short enough to never clip. */
  vertical: string;
  hue: number;
  /**
   * Hue of the gradient's dark stop. Set it explicitly whenever the
   * default (+38) lands somewhere ugly: warm hues rotate INTO olive, so
   * orange covers faded to muddy yellow-green until these were pinned.
   * Warm packs therefore rotate DOWN into red instead of up into green.
   */
  hue2?: number;
};

/**
 * Hand-set art direction for the packs we ship. Presentation, not data:
 * it lives here rather than in the catalog or a DB column because it
 * says nothing about what a pack CONTAINS. Every glyph is a word the
 * pack actually teaches.
 *
 * A pack with no entry falls back to a deterministic glyph + hue from
 * its slug, so a new pack looks right the day it's added and nobody has
 * to remember to come back here.
 */
const PACK_ART: Record<string, PackArt> = {
  // Orange gi into the red of the belt.
  "dragon-ball-japanese": {
    glyph: "龍",
    vertical: "ドラゴンボール",
    hue: 34,
    hue2: 8,
  },
  // Purple falling into an indigo near-black.
  "death-note-japanese": {
    glyph: "死",
    vertical: "デスノート",
    hue: 284,
    hue2: 258,
  },
  // Ocean into deep water.
  "one-piece-japanese": {
    glyph: "海",
    vertical: "ワンピース",
    hue: 206,
    hue2: 228,
  },
  "naruto-japanese": { glyph: "忍", vertical: "ナルト", hue: 18, hue2: 350 },
  "persona-5-japanese": { glyph: "心", vertical: "ペルソナ５", hue: 352, hue2: 330 },
  // Mako green into deep teal.
  "final-fantasy-vii-japanese": {
    glyph: "魔",
    vertical: "ファイナルファンタジー",
    hue: 152,
    hue2: 178,
  },
  "anime-essentials-japanese": {
    glyph: "技",
    vertical: "アニメ",
    hue: 318,
    hue2: 344,
  },
  "gaming-japanese": { glyph: "勇", vertical: "ゲーム", hue: 248, hue2: 272 },
  "cafe-french": { glyph: "C", vertical: "CAFÉ", hue: 22, hue2: 356 },
};

function packArt(slug: string, name: string): PackArt {
  const known = PACK_ART[slug];
  if (known) return known;
  // Spread, not [0] — a first character outside the BMP is a surrogate
  // pair and indexing would slice it in half.
  return {
    glyph: [...name][0] ?? "?",
    vertical: name,
    hue: coverHue(slug),
  };
}

export function PackCover({
  slug,
  name,
  language,
  className,
}: {
  slug: string;
  name: string;
  language: string;
  className?: string;
}) {
  const { glyph, vertical, hue, hue2 } = packArt(slug, name);
  const dark = hue2 ?? (hue + 38) % 360;

  return (
    <div
      className={cn(
        "pack-cover relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-md shadow-card",
        className,
      )}
      // A real cover keeps its own colors in both themes — same call the
      // library's BookCover makes.
      style={{
        background: `linear-gradient(160deg, hsl(${hue} 54% 44%) 0%, hsl(${dark} 58% 22%) 100%)`,
      }}
    >
      {/* Screentone — the halftone dots that make a flat fill read as
          print rather than as a gradient swatch. */}
      <span
        aria-hidden
        className="pack-cover-tone absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.18) 1px, transparent 1.15px)",
          backgroundSize: "6px 6px",
        }}
      />

      {/* Spine rule, matching the library covers. */}
      <span
        aria-hidden
        className="pack-cover-spine absolute inset-y-0 left-1.5 w-px bg-white/25"
      />

      <span
        aria-hidden
        className="pack-cover-glyph -mt-3 select-none text-[4.5rem] font-bold leading-none text-white/95 drop-shadow-[0_2px_8px_rgba(0,0,0,0.35)]"
      >
        {glyph}
      </span>

      <span
        aria-hidden
        className="pack-cover-vertical absolute right-2 top-3 text-[0.6875rem] font-medium tracking-[0.14em] text-white/85"
        style={{ writingMode: "vertical-rl", textOrientation: "upright" }}
      >
        {vertical}
      </span>

      {/* Publisher band — the strip along the foot of a tankōbon. */}
      <span className="pack-cover-band absolute inset-x-0 bottom-0 bg-black/30 px-2 py-1 text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-white/90">
        {language}
      </span>
    </div>
  );
}
