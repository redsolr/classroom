"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pin, PinOff, Trash2 } from "lucide-react";
import { deleteStudyBook, toggleStudyBookPin } from "@/lib/actions/books";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui/dropdown";

/**
 * A book's ⋯ menu.
 *
 * The delete confirmation says what SURVIVES, not just what goes. Both
 * FKs are SET NULL, so the decks come loose with every card's review
 * history intact and the notes become standalone notes — and someone
 * about to press delete has no way of knowing that unless we say it.
 * "This cannot be undone" would be both scarier and less true.
 */
export function BookMenu({
  bookId,
  title,
  pinned,
  deckCount,
  noteCount,
}: {
  bookId: string;
  title: string;
  pinned: boolean;
  deckCount: number;
  noteCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const survives = [
    deckCount > 0 && `${deckCount} deck${deckCount === 1 ? "" : "s"}`,
    noteCount > 0 && `${noteCount} note${noteCount === 1 ? "" : "s"}`,
  ].filter(Boolean);

  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button
          type="button"
          aria-label={`${title} options`}
          title="Book options"
          className="flex size-9 items-center justify-center rounded-md text-fg-tertiary transition-colors hover:bg-surface-hover hover:text-fg"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownTrigger>
      <DropdownContent align="end" className="w-56">
        <DropdownItem
          disabled={pending}
          onSelect={() =>
            startTransition(async () => {
              try {
                await toggleStudyBookPin(bookId);
                router.refresh();
              } catch (error) {
                console.error("book menu: failed to toggle pin", error);
              }
            })
          }
        >
          {pinned ? (
            <PinOff className="size-4 text-fg-tertiary" />
          ) : (
            <Pin className="size-4 text-fg-tertiary" />
          )}
          {pinned ? "Unpin" : "Pin"}
        </DropdownItem>
        <DropdownSeparator />
        <DropdownItem
          disabled={pending}
          className="text-danger"
          onSelect={() => {
            const keeps =
              survives.length > 0
                ? ` Your ${survives.join(" and ")} stay — they just come out of this book.`
                : "";
            if (!window.confirm(`Delete “${title}”?${keeps}`)) return;
            startTransition(async () => {
              try {
                // The action redirects to /books; NEXT_REDIRECT is
                // handled by Next before it reaches the catch, so
                // anything landing there is a real failure.
                await deleteStudyBook(bookId);
              } catch (error) {
                console.error("book menu: failed to delete", error);
              }
            });
          }}
        >
          <Trash2 className="size-4" />
          Delete book
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}
