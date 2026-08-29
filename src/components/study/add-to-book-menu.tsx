"use client";

import * as React from "react";
import { BookPlus, Check, Search } from "lucide-react";
import { DropdownItem, DropdownSeparator } from "@/components/ui/dropdown";

export type BookOption = { id: string; name: string };

/** Above this many books, the list grows a filter field. Below it, a
 * search box is more chrome than help. */
const FILTER_THRESHOLD = 6;

/**
 * "Add to book" — the add-to-playlist picker, as a SECTION of the ⋯ menu
 * rather than a submenu behind it.
 *
 * A find-a-book field, a "New book…" escape hatch, then every book with
 * a ✓ on the ones already holding this word. Selecting a book TOGGLES
 * membership, which is why one control covers both filing and unfiling
 * instead of the two separate lists this replaced.
 *
 * Flat, not nested: the menu this lives in holds exactly two things
 * (file it, or drop it), so a "▸" submenu would put the only content
 * behind an extra hop — the pattern is worth copying where a menu has
 * eight items, not two.
 *
 * One deliberate difference from the thing it's modeled on: picking a
 * book does NOT close the menu. Filing a word into three books is the
 * common case here, and re-opening the ⋯ twice to do it is the kind of
 * small tax that makes people stop bothering.
 */
export function AddToBookMenu({
  books,
  inBookIds,
  disabled,
  onToggle,
  onCreate,
}: {
  books: BookOption[];
  inBookIds: string[];
  disabled?: boolean;
  onToggle: (bookId: string, isIn: boolean) => void;
  onCreate: () => void;
}) {
  const [query, setQuery] = React.useState("");
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? books.filter((b) => b.name.toLowerCase().includes(needle))
    : books;

  return (
    <>
      <p className="px-2 pt-1 pb-1.5 text-[0.72rem] font-semibold tracking-wider text-fg-tertiary uppercase">
        Add to book
      </p>

      {books.length > FILTER_THRESHOLD && (
        <div className="mb-1 flex items-center gap-1.5 rounded-md bg-surface-hover px-2 py-1.5">
          <Search className="size-3.5 shrink-0 text-fg-tertiary" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a book"
            aria-label="Find a book"
            // Radix menus swallow keystrokes for typeahead, which makes
            // any field inside one unusable without this.
            onKeyDown={(e) => e.stopPropagation()}
            className="min-w-0 flex-1 bg-transparent text-[0.875rem] placeholder:text-fg-tertiary focus:outline-none"
          />
        </div>
      )}

      {shown.map((bookOption) => {
        const isIn = inBookIds.includes(bookOption.id);
        return (
          <DropdownItem
            key={bookOption.id}
            disabled={disabled}
            onSelect={(event) => {
              // Stay open: filing one word into several books is the
              // common case.
              event.preventDefault();
              onToggle(bookOption.id, isIn);
            }}
          >
            <span className="truncate">{bookOption.name}</span>
            {isIn && (
              <Check className="ml-auto size-4 shrink-0 text-accent-text" />
            )}
          </DropdownItem>
        );
      })}

      {books.length > 0 && shown.length === 0 && (
        <p className="px-2 py-1.5 text-[0.8125rem] text-fg-tertiary">
          No book matches “{query}”.
        </p>
      )}

      {shown.length > 0 && <DropdownSeparator />}

      <DropdownItem disabled={disabled} onSelect={onCreate}>
        <BookPlus className="size-4 text-fg-tertiary" />
        New book…
      </DropdownItem>
    </>
  );
}
