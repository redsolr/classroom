"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Sparkles,
  Star,
  StarOff,
  Trash2,
} from "lucide-react";
import {
  deleteStudyDeck,
  renameStudyDeck,
  setDefaultStudyDeck,
  toggleStudyDeckPin,
} from "@/lib/actions/decks";
import { addStudyVocab } from "@/lib/actions/vocab";
import { Button } from "@/components/ui/button";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { InlineRenameInput } from "@/components/ui/inline-rename-input";
import { NewDeckDialog } from "@/components/study/new-deck-dialog";
import { WordFormDialog } from "@/components/study/word-form-dialog";
import { BookTile, LikedCover } from "@/components/study/study-covers";
import type { DeckSummaryRow } from "@/components/study/vocab-table";

/**
 * THE DECK LIST — All words plus one row per deck, each openable in one
 * tap, with management (pin to sidebar, rename inline, set default,
 * delete) on the row's ⋯ menu.
 *
 * It was the "bookshelf" until books became containers (2026-08-30).
 * The rows never changed — they were always decks — but the page around
 * them did, so it now sits UNDER the book shelf on /books rather than
 * being the whole landing. Managing a deck and choosing one to drill are
 * different jobs: /decks is where you pick something to drill, this is
 * where you tidy up.
 */

/** "New word" for the general vocabulary — the shared form, as a dialog. */
export function AddWordDialogButton() {
  return (
    <WordFormDialog
      title="New word"
      description="Added to your vocabulary."
      trigger={<Button variant="primary">New word</Button>}
      action={addStudyVocab}
    />
  );
}

/**
 * One deck: open it, or manage it from the ⋯ menu.
 *
 * The user-visible strings here still say "book" — "Make default book",
 * "Delete book", the ⋯ tooltip. That is a RECORDED residual of the
 * 2026-08-30 merge (see `FEATURES.md`), not an oversight: these controls
 * belong to the `/books` page queued for a redesign, and renaming labels
 * on a page about to be reconsidered whole is churn. The code says deck,
 * because a deck is what the row is.
 */
function DeckRow({ deck }: { deck: DeckSummaryRow }) {
  const router = useRouter();
  const [renaming, setRenaming] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const commitRename = (name: string) => {
    startTransition(async () => {
      try {
        await renameStudyDeck(deck.id, name);
      } catch (err) {
        console.error("vocab: failed to rename deck", err);
      }
    });
  };

  return (
    <li className="book-row group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-hover sm:px-4">
      <BookTile name={deck.name} className="w-11 shrink-0" />
      {renaming ? (
        <InlineRenameInput
          initialValue={deck.name}
          ariaLabel="Rename deck"
          onCommit={commitRename}
          onClose={() => setRenaming(false)}
          className="min-w-0 flex-1 text-[0.9375rem]"
        />
      ) : (
        <Link
          href={`/decks/${deck.id}`}
          className="min-w-0 flex-1"
        >
          <span className="block truncate text-[0.9375rem] font-medium">
            {deck.name}
            {deck.pinned && (
              <Pin className="ml-1.5 inline size-3 text-fg-tertiary" />
            )}
          </span>
          <span className="text-[0.8125rem] text-fg-tertiary">
            {deck.itemIds.length} word{deck.itemIds.length === 1 ? "" : "s"}
            {deck.isDefault && (
              <span className="ml-2 rounded-full bg-accent-soft px-1.5 py-0.5 text-[0.6875rem] font-semibold text-accent-text">
                Default
              </span>
            )}
          </span>
        </Link>
      )}
      <Dropdown>
        <DropdownTrigger asChild>
          <button
            type="button"
            aria-label={`${deck.name} options`}
            title="Book options"
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-fg-tertiary opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:text-fg max-lg:opacity-100 data-[state=open]:opacity-100 data-[state=open]:text-fg"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownTrigger>
        <DropdownContent align="start" className="w-56">
          {/* The default book is where a one-tap save lands — the
              "playlist I'm currently building". One per learner, so
              choosing a new one silently clears the old. */}
          <DropdownItem
            disabled={pending}
            onSelect={() => {
              startTransition(async () => {
                try {
                  await setDefaultStudyDeck(deck.id, !deck.isDefault);
                  router.refresh();
                } catch (err) {
                  console.error("vocab: failed to set default deck", err);
                }
              });
            }}
          >
            {deck.isDefault ? (
              <StarOff className="size-4 text-fg-tertiary" />
            ) : (
              <Star className="size-4 text-fg-tertiary" />
            )}
            {deck.isDefault ? "Clear default book" : "Make default book"}
          </DropdownItem>
          <DropdownItem
            disabled={pending}
            onSelect={() => {
              startTransition(async () => {
                try {
                  await toggleStudyDeckPin(deck.id);
                  router.refresh();
                } catch (err) {
                  console.error("vocab: failed to toggle deck pin", err);
                }
              });
            }}
          >
            {deck.pinned ? (
              <PinOff className="size-4 text-fg-tertiary" />
            ) : (
              <Pin className="size-4 text-fg-tertiary" />
            )}
            {deck.pinned ? "Unpin from sidebar" : "Pin to sidebar"}
          </DropdownItem>
          <DropdownItem disabled={pending} onSelect={() => setRenaming(true)}>
            <Pencil className="size-4 text-fg-tertiary" />
            Rename
          </DropdownItem>
          <DropdownSeparator />
          <DropdownItem
            disabled={pending}
            className="text-danger"
            onSelect={() => {
              if (
                !window.confirm(
                  `Delete “${deck.name}”? Its words stay in your vocabulary.`,
                )
              )
                return;
              startTransition(async () => {
                try {
                  await deleteStudyDeck(deck.id);
                } catch (err) {
                  console.error("vocab: failed to delete deck", err);
                }
              });
            }}
          >
            <Trash2 className="size-4" />
            Delete book
          </DropdownItem>
        </DropdownContent>
      </Dropdown>
    </li>
  );
}

export function VocabShelf({
  decks,
  totalWords,
}: {
  decks: DeckSummaryRow[];
  totalWords: number;
}) {
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <AddWordDialogButton />
        <NewDeckDialog />
        <Link
          href="/official"
          className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[0.9375rem] font-medium text-accent-text transition-colors hover:bg-surface-hover"
        >
          <Sparkles className="size-3.5" />
          Browse official books
        </Link>
      </div>

      {/* Named container: the official cover shelf elsewhere on the page
          can hold a book with the SAME title (saving an official book
          names your copy after it), so the learner's OWN decks have to
          be addressable on their own. */}
      <ul className="decks-shelf divide-y divide-border overflow-hidden rounded-xl bg-surface shadow-card">
        {/* Your vocabulary IS the liked layer — a word is in it or it
            isn't — so it wears the liked tile, not a book cover. */}
        <li className="transition-colors hover:bg-surface-hover">
          <Link
            href="/decks/all"
            className="flex items-center gap-3 px-3 py-2.5 sm:px-4"
          >
            <LikedCover className="w-11 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-[0.9375rem] font-medium">
                All words
              </span>
              <span className="text-[0.8125rem] text-fg-tertiary">
                {totalWords} word{totalWords === 1 ? "" : "s"} · every language
              </span>
            </span>
          </Link>
        </li>
        {decks.map((deck) => (
          <DeckRow key={deck.id} deck={deck} />
        ))}
      </ul>

      {decks.length === 0 && (
        <p className="mt-3 text-[0.875rem] text-fg-tertiary">
          No books yet — create one, save a filtered view as a book, or
          import an official one.
        </p>
      )}
    </div>
  );
}
