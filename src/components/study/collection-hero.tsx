import * as React from "react";
import { coverHue } from "@/components/study/book-cover";

/**
 * The COLLECTION HEADER — one shape for every "a pile of words you can
 * study" page: your book, an official book, a deck.
 *
 * This was a straight lift of a streaming playlist header — full-bleed
 * gradient banner, uppercase eyebrow stacked over a 3.25rem display
 * title, everything bottom-aligned. It arrived well and read as somebody
 * else's app. Rebuilt in Classroom's own language (2026-08-29):
 *
 *   - a CARD (`rounded-xl bg-surface shadow-card`), the container every
 *     other surface in this app already uses, instead of a bled banner
 *   - the collection's hue as a soft glow BEHIND THE COVER only, so the
 *     colour is still present without painting the whole header
 *   - the kind of thing ("Book", "Official book") as an inline pill in
 *     the app's existing badge language, not an uppercase eyebrow
 *   - a title one step above the page scale (2rem) rather than a
 *     billboard — this is a heading, not a hero image
 *
 * Server component: no hooks, so every page renders it directly.
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
  /** What kind of thing this is — rendered as a pill beside the meta. */
  eyebrow: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Tints the glow. Defaults to the title's own generated hue, so the
   * header and the cover always agree. */
  hueSeed?: string | number;
}) {
  const hue =
    typeof hueSeed === "number"
      ? hueSeed
      : coverHue(hueSeed ?? (typeof title === "string" ? title : "book"));

  return (
    <div className="collection-hero mb-6 overflow-hidden rounded-xl bg-surface p-4 shadow-card sm:p-5">
      <div className="collection-hero-head flex items-center gap-4 sm:gap-5">
        {/* The glow sits behind the art, not across the header: the
            collection keeps its colour, the page keeps its surface. */}
        <div className="relative w-20 shrink-0 sm:w-28">
          <div
            aria-hidden
            className="absolute -inset-3 rounded-full blur-2xl"
            style={{ background: `hsl(${hue} 70% 50% / 0.35)` }}
          />
          <div className="relative">{cover}</div>
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="collection-hero-title text-[1.5rem] leading-tight font-semibold tracking-tight sm:text-[2rem]">
            {title}
          </h1>
          <p className="collection-hero-meta mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.875rem] text-fg-secondary">
            <span className="collection-hero-kind rounded-full bg-accent-soft px-2 py-0.5 text-[0.72rem] font-semibold text-accent-text">
              {eyebrow}
            </span>
            {meta}
          </p>
        </div>
      </div>

      {description && (
        <p className="collection-hero-description mt-4 max-w-2xl text-[0.9375rem] leading-relaxed text-fg-secondary">
          {description}
        </p>
      )}

      {actions && (
        <div className="collection-hero-actions mt-4 flex flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}

/**
 * The one loud action on a collection page. Deep rose (`--practice`):
 * energetic, never destructive, and the same object everywhere so it's
 * recognised before it's read. A pill at the app's own control height —
 * the oversized circular play it started as belonged to another app.
 */
export function PlayAction({
  children,
  ...props
}: React.ComponentProps<"a"> & { children: React.ReactNode }) {
  return (
    <a
      {...props}
      className="play-action inline-flex h-10 items-center gap-2 rounded-full bg-practice pr-5 pl-4 text-[0.9375rem] font-semibold text-white shadow-sm transition-colors hover:bg-practice-hover"
    >
      {children}
    </a>
  );
}
