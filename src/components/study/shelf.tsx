import * as React from "react";
import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";

/**
 * A SHELF — a titled row of artwork that scrolls sideways.
 *
 * One row that stays one row: wrapping turns a shelf into a grid, and a
 * grid of everything is the library page, which is a different surface.
 * The "See all" link is where completeness lives.
 *
 * The heading is deliberately BIG (1.375rem, bold). Section titles at
 * body scale made the page read as a settings screen with pictures on
 * it; the shelves are the content here, and the type has to say so.
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
  return (
    <section className={`shelf ${className}`}>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="shelf-title text-[1.5rem] font-bold tracking-tight sm:text-[1.875rem]">
          {title}
        </h2>
        {seeAllHref && (
          <Link
            href={seeAllHref}
            className="shrink-0 inline-flex items-center gap-1 text-[0.875rem] font-medium text-accent-text transition-colors hover:underline"
          >
            See all
            <ArrowRight className="size-3.5" />
          </Link>
        )}
      </div>
      {subtitle && (
        <p className="mb-2 text-[0.875rem] text-fg-tertiary">{subtitle}</p>
      )}

      {/* Negative margin + padding lets the row bleed to the shell edge
          while keeping the covers' focus rings from being clipped. */}
      <div className="-mx-1 mt-4 overflow-x-auto px-1 pb-2">
        <ul className="flex w-max gap-4">{children}</ul>
      </div>
    </section>
  );
}

/**
 * One item on a shelf: artwork, a name, a line of state.
 *
 * The artwork is the point, so it's given real size (156px) rather than
 * the thumbnail it started at — a shelf of small covers reads as a
 * toolbar. Hover brightens instead of lifting: a translate makes a row
 * of covers bob as the pointer crosses it, which is a wiggle, not
 * feedback.
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
          {playable && (
            <span
              aria-hidden
              className="absolute right-2.5 bottom-2.5 flex size-12 items-center justify-center rounded-full bg-practice text-white shadow-overlay transition-opacity duration-200 opacity-0 group-hover:opacity-100 max-lg:opacity-100"
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
