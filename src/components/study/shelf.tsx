"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, Play } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A SHELF — a titled row of artwork that scrolls sideways.
 *
 * One row that stays one row: wrapping turns a shelf into a grid, and a
 * grid of everything is the library page, which is a different surface.
 * The "See all" link is where completeness lives.
 *
 * The heading is deliberately BIG. Section titles at body scale made the
 * page read as a settings screen with pictures on it; the shelves are
 * the content here, and the type has to say so.
 *
 * A shelf takes the FULL width of its page — it is never capped to a
 * reading measure. Home's rows used to sit in a `max-w-3xl` box inside a
 * `max-w-6xl` shell, so on a wide monitor the covers were clipped at
 * 768px with several hundred pixels of empty page beside them. Artwork
 * is not prose: the wider the window, the more of the shelf you see.
 *
 * The ‹ › live in the HEADER, next to "See all", not floating over the
 * artwork — which is where every streaming shelf puts them, and also the
 * only place that works here: covers come in two aspect ratios
 * (`aspect-square` collections, `aspect-[3/4]` pack spines), so an
 * overlay centred on one is off-centre on the other.
 */
export function Shelf({
  title,
  subtitle,
  seeAllHref,
  className = "",
  children,
}: {
  title: string;
  subtitle?: string;
  seeAllHref?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const track = React.useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = React.useState(true);
  const [atEnd, setAtEnd] = React.useState(true);

  const measure = React.useCallback(() => {
    const el = track.current;
    if (!el) return;
    // 1px of slack: fractional layout widths mean scrollLeft never lands
    // exactly on the maximum, which would leave the › live on a row with
    // nowhere left to go.
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft >= el.scrollWidth - el.clientWidth - 1);
  }, []);

  React.useEffect(() => {
    const el = track.current;
    if (!el) return;
    measure();
    // Position is READ, never asserted, so the buttons stay honest
    // through a resize, a row that grew a card, and momentum scrolling
    // the learner drove themselves.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  /** One page = one viewport of covers, less a card's worth of overlap
   * so the cover you were looking at doesn't vanish entirely. */
  const page = (direction: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    el.scrollBy({
      left: direction * Math.max(el.clientWidth - 96, 160),
      behavior: "smooth",
    });
  };

  const scrollable = !(atStart && atEnd);

  return (
    <section className={`shelf ${className}`}>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="shelf-title text-[1.5rem] font-bold tracking-tight sm:text-[1.875rem]">
          {title}
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          {seeAllHref && (
            <Link
              href={seeAllHref}
              className="mr-1 inline-flex items-center gap-1 text-[0.875rem] font-medium text-accent-text transition-colors hover:underline"
            >
              See all
              <ArrowRight className="size-3.5" />
            </Link>
          )}
          {/* Pointer-only chrome: a touch row is scrolled by the gesture,
              and a pair of dead buttons is worse than none. */}
          {scrollable && (
            <>
              <ShelfArrow
                side="left"
                disabled={atStart}
                onClick={() => page(-1)}
              />
              <ShelfArrow
                side="right"
                disabled={atEnd}
                onClick={() => page(1)}
              />
            </>
          )}
        </div>
      </div>
      {subtitle && (
        <p className="mb-2 text-[0.875rem] text-fg-tertiary">{subtitle}</p>
      )}

      {/* Negative margin + padding lets the row bleed to the shell edge
          while keeping the covers' focus rings from being clipped. */}
      <div
        ref={track}
        onScroll={measure}
        className="shelf-track -mx-1 mt-4 overflow-x-auto px-1 pb-2"
      >
        <ul className="flex w-max gap-4">{children}</ul>
      </div>
    </section>
  );
}

function ShelfArrow({
  side,
  disabled,
  onClick,
}: {
  side: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={side === "left" ? "Scroll left" : "Scroll right"}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "shelf-arrow hidden size-8 items-center justify-center rounded-full bg-surface-hover text-fg transition-opacity lg:flex",
        // Dimmed rather than removed at an end: a control that vanishes
        // mid-row makes the other one jump sideways.
        disabled && "pointer-events-none opacity-40",
      )}
    >
      <Icon className="size-4.5" />
    </button>
  );
}

/**
 * One item on a shelf: artwork, a name, a line of state.
 *
 * The artwork is the point, so it's given real size rather than the
 * thumbnail it started at — a shelf of small covers reads as a toolbar.
 * Hover brightens instead of lifting: a translate makes a row of covers
 * bob as the pointer crosses it, which is a wiggle, not feedback.
 */
export function ShelfCard({
  href,
  name,
  detail,
  badge,
  playable,
  cover,
}: {
  href: string;
  name: string;
  detail: string;
  /** Overlaid on the artwork — a due count, usually. */
  badge?: string;
  /** Draws the play overlay. Only where there's something to drill. */
  playable?: boolean;
  cover: React.ReactNode;
}) {
  return (
    <li className="shelf-card w-[168px] shrink-0 sm:w-[196px]">
      <Link href={href} className="group block">
        <div className="relative">
          <div className="transition duration-200 group-hover:brightness-110">
            {cover}
          </div>
          {badge && (
            <span className="shelf-card-badge absolute top-2.5 left-2.5 rounded-full bg-practice px-2.5 py-1 text-[0.8125rem] font-semibold text-white shadow-sm">
              {badge}
            </span>
          )}
          {/* White disc, dark glyph — NOT the practice rose. The rose is
              a brand colour sitting on artwork whose hue changes per
              collection (violet, green, amber, magenta), so it clashed
              with most covers instead of reading as one control. White
              is hue-neutral, it survives any cover, and it's already the
              app's word for "the primary action here" — the spotlight's
              "Start reviewing" pill is the same white-on-dark. The
              shadow is a soft drop, not `shadow-overlay`, whose 1px ring
              would draw a grey outline around a white disc. */}
          {playable && (
            <span
              aria-hidden
              className="absolute right-2.5 bottom-2.5 flex size-11 items-center justify-center rounded-full bg-white text-neutral-900 shadow-[0_2px_10px_rgba(0,0,0,0.4)] transition-opacity duration-200 opacity-0 group-hover:opacity-100 max-lg:opacity-100"
            >
              <Play className="size-5 fill-current" />
            </span>
          )}
        </div>
        <span className="mt-2.5 block truncate text-[1rem] font-semibold">
          {name}
        </span>
        <span className="block truncate text-[0.875rem] text-fg-tertiary">
          {detail}
        </span>
      </Link>
    </li>
  );
}
