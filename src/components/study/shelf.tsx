import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * A SHELF — a titled row of artwork that scrolls sideways.
 *
 * One row that stays one row: wrapping turns a shelf into a grid, and a
 * grid of everything is the library page, which is a different surface.
 * The "See all" link is where the completeness lives.
 *
 * Extracted from the official-books shelf when Home grew shelves of its
 * own; the heading/see-all/scroller shell is the part they share, and
 * the cover markup is the part they don't.
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
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[1rem] font-semibold">{title}</h2>
        {seeAllHref && (
          <Link
            href={seeAllHref}
            className="inline-flex items-center gap-1 text-[0.875rem] font-medium text-accent-text transition-colors hover:underline"
          >
            See all
            <ArrowRight className="size-3.5" />
          </Link>
        )}
      </div>
      {subtitle && (
        <p className="mb-3 text-[0.875rem] text-fg-tertiary">{subtitle}</p>
      )}

      {/* Negative margin + padding lets the row bleed to the shell edge
          while keeping the covers' focus rings from being clipped. */}
      <div className="-mx-1 overflow-x-auto px-1 pb-2">
        <ul className="flex w-max gap-4">{children}</ul>
      </div>
    </section>
  );
}
