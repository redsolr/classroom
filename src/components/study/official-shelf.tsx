import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PackCover } from "@/components/study/pack-cover";

export type OfficialShelfItem = {
  id: string;
  slug: string;
  name: string;
  language: string;
  itemCount: number;
};

/**
 * The official catalog, shown as ARTWORK in the flow of the Books page
 * rather than hidden behind a tab.
 *
 * A tab is a filter — it reads as "another view of what I already have",
 * so it gets skipped. Official content is the main draw, and its pull is
 * the covers, so it goes where the eye already is: under the learner's
 * own books, in the space an early library leaves empty. Same shape the
 * app stores and streaming services use — your stuff first, then a row
 * of art you didn't ask for and can't miss.
 *
 * Scrolls sideways rather than wrapping: a row that stays one row keeps
 * the learner's own books the tallest thing on the page.
 */
export function OfficialShelf({ items }: { items: OfficialShelfItem[] }) {
  if (items.length === 0) return null;

  return (
    <section className="official-shelf mt-8 max-w-3xl">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[1rem] font-semibold">Official books</h2>
        <Link
          href="/packs"
          className="inline-flex items-center gap-1 text-[0.875rem] font-medium text-accent-text transition-colors hover:underline"
        >
          See all
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
      <p className="mb-3 text-[0.875rem] text-fg-tertiary">
        Ready-made word books — take what you want, or drill one as a deck
        without saving it.
      </p>

      {/* Negative margin + padding lets the row bleed to the shell edge
          while keeping the covers' focus rings from being clipped. */}
      <div className="-mx-1 overflow-x-auto px-1 pb-2">
        <ul className="flex w-max gap-4">
          {items.map((item) => (
            <li key={item.id} className="w-[124px] shrink-0">
              <Link href={`/packs/${item.slug}`} className="group block">
                <PackCover
                  slug={item.slug}
                  name={item.name}
                  language={item.language}
                  className="transition-transform group-hover:-translate-y-1"
                />
                <span className="mt-2 block truncate text-[0.875rem] font-medium">
                  {item.name}
                </span>
                <span className="block text-[0.8125rem] text-fg-tertiary">
                  {item.itemCount} word{item.itemCount === 1 ? "" : "s"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
