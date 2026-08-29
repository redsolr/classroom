import * as React from "react";
import { coverHue } from "@/components/study/book-cover";

/**
 * The COLLECTION HEADER — one shape for every "a pile of words you can
 * study" page: your book, an official book, a deck.
 *
 * Straight from the playlist-page shape: a tinted wash behind the
 * cover, a small eyebrow saying what kind of thing this is, the title
 * set oversized, a quiet meta line, and the loud action sitting just
 * below it all. The point is that opening a book should feel like
 * arriving somewhere, not like loading a table.
 *
 * The wash is the collection's own hue at LOW ALPHA over the page
 * background, so one definition works in both themes — a solid tint
 * would have needed a light and a dark variant that then drift apart.
 * Server component: no hooks, so every page can render it directly.
 */
export function CollectionHero({
  cover,
  eyebrow,
  title,
  meta,
  description,
  actions,
  hueSeed,
}: {
  cover: React.ReactNode;
  eyebrow: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Tints the wash. Defaults to the title's own generated hue, so the
   * header and the cover always agree. */
  hueSeed?: string | number;
}) {
  const hue =
    typeof hueSeed === "number"
      ? hueSeed
      : coverHue(hueSeed ?? (typeof title === "string" ? title : "book"));

  return (
    <div
      className="collection-hero -mx-4 mb-6 rounded-none px-4 pt-6 pb-5 sm:-mx-6 sm:px-6 lg:-mx-10 lg:rounded-2xl lg:px-10 lg:pt-8"
      style={{
        background: `linear-gradient(175deg, hsl(${hue} 70% 50% / 0.24) 0%, hsl(${hue} 70% 50% / 0.07) 55%, transparent 100%)`,
      }}
    >
      <div className="collection-hero-head flex items-end gap-4 sm:gap-6">
        <div className="w-24 shrink-0 sm:w-36 lg:w-44">{cover}</div>
        <div className="min-w-0 flex-1 pb-1">
          <p className="collection-hero-eyebrow text-[0.75rem] font-semibold tracking-wider text-fg-secondary uppercase">
            {eyebrow}
          </p>
          <h1 className="collection-hero-title mt-1 text-[1.75rem] leading-[1.05] font-bold tracking-tight sm:text-[2.5rem] lg:text-[3.25rem]">
            {title}
          </h1>
          {meta && (
            <p className="collection-hero-meta mt-2 text-[0.875rem] text-fg-secondary sm:text-[0.9375rem]">
              {meta}
            </p>
          )}
        </div>
      </div>

      {description && (
        <p className="collection-hero-description mt-4 max-w-2xl text-[0.9375rem] leading-relaxed text-fg-secondary">
          {description}
        </p>
      )}

      {actions && (
        <div className="collection-hero-actions mt-5 flex flex-wrap items-center gap-3">
          {actions}
        </div>
      )}
    </div>
  );
}

/**
 * The one loud action on a collection page — the play button. Deep rose
 * (`--practice`), circular, oversized: energetic, never destructive, and
 * the same object everywhere so it's recognised before it's read.
 */
export function PlayAction({
  children,
  ...props
}: React.ComponentProps<"a"> & { children: React.ReactNode }) {
  return (
    <a
      {...props}
      className="play-action inline-flex h-12 items-center gap-2.5 rounded-full bg-practice pr-6 pl-5 text-[1rem] font-semibold text-white shadow-sm transition-transform hover:scale-[1.03] hover:bg-practice-hover"
    >
      {children}
    </a>
  );
}
