import Link from "next/link";
import { PackCover } from "@/components/study/pack-cover";
import { Shelf } from "@/components/study/shelf";

export type OfficialShelfItem = {
  id: string;
  slug: string;
  name: string;
  language: string;
  itemCount: number;
};

/**
 * The official catalog, shown as ARTWORK in the flow of a page rather
 * than hidden behind a tab.
 *
 * A tab is a filter — it reads as "another view of what I already have",
 * so it gets skipped. Official content is the main draw, and its pull is
 * the covers, so it goes where the eye already is: under the learner's
 * own books, in the space an early library leaves empty. Your stuff
 * first, then a row of art you didn't ask for and can't miss.
 */
export function OfficialShelf({ items }: { items: OfficialShelfItem[] }) {
  if (items.length === 0) return null;

  return (
    <Shelf
      title="Official books"
      subtitle="Ready-made word books — take what you want, or drill one as a deck without saving it."
      seeAllHref="/official"
      className="official-shelf mt-8 max-w-3xl"
    >
      {items.map((item) => (
        <li key={item.id} className="w-[124px] shrink-0">
          <Link href={`/official/${item.slug}`} className="group block">
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
    </Shelf>
  );
}
