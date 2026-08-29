import Link from "next/link";
import { Play } from "lucide-react";
import {
  BookTile,
  LikedCover,
  SentenceCover,
} from "@/components/study/study-covers";

export type QuickPick = {
  key: string;
  name: string;
  /** One line of state: "12 due", "48 words", … */
  detail: string;
  href: string;
  art: "liked" | "book" | "sentences";
  /** Draws the play affordance — only when there's something to drill. */
  playable?: boolean;
};

/**
 * QUICK PICKS — the top of Home: wide, low tiles you hit without
 * reading, cover on the left, name on the right.
 *
 * This exact grid was cut from the Books page a few hours after it was
 * built, because there it sat directly above a shelf of the same links
 * and was simply the same thing twice. On HOME it is not a duplicate:
 * home and library are different surfaces, which is the whole reason
 * every app that has this row also has a separate library page. Books
 * stays the place you manage; this is the place you resume.
 *
 * Capped by the caller. A grid that grows with the collection stops
 * being shortcuts and becomes a worse copy of the library.
 */
export function QuickPicks({ items }: { items: QuickPick[] }) {
  if (items.length === 0) return null;

  return (
    <ul className="quick-picks grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <li key={item.key}>
          <Link
            href={item.href}
            className="quick-pick group flex items-center gap-3 overflow-hidden rounded-lg bg-surface pr-3 shadow-card transition-colors hover:bg-surface-hover"
          >
            {item.art === "liked" ? (
              <LikedCover className="w-14 shrink-0 rounded-none shadow-none" />
            ) : item.art === "sentences" ? (
              <SentenceCover className="w-14 shrink-0 rounded-none shadow-none" />
            ) : (
              <BookTile
                name={item.name}
                className="w-14 shrink-0 rounded-none shadow-none"
              />
            )}
            <span className="min-w-0 flex-1 py-2">
              <span className="block truncate text-[0.9375rem] font-semibold">
                {item.name}
              </span>
              <span className="block truncate text-[0.8125rem] text-fg-tertiary">
                {item.detail}
              </span>
            </span>
            {item.playable && (
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-practice text-white opacity-0 transition-opacity group-hover:opacity-100 max-lg:opacity-100"
              >
                <Play className="size-3.5 fill-current" />
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
