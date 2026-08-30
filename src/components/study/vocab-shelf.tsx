"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Sparkles,
  Star,
  StarOff,
  Trash2,
} from "lucide-react";
import {
  createStudyDeck,
  deleteStudyDeck,
  renameStudyDeck,
  setDefaultStudyDeck,
  toggleStudyDeckPin,
} from "@/lib/actions/decks";
import { addStudyVocab } from "@/lib/actions/vocab";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { Input } from "@/components/ui/field";
import { InlineRenameInput } from "@/components/ui/inline-rename-input";
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
 * A new, empty DECK — it always was one; it just said "book" back when
 * decks were called books. Two controls on the same page saying "New
 * book" while one makes a deck is the exact confusion the merge exists
 * to end (and it made the label ambiguous to a screen reader too).
 */
function NewDeckDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
    if (!name) return;
    startTransition(async () => {
      try {
        const { id } = await createStudyDeck(name, []);
        setOpen(false);
        router.push(`/decks/${id}`);
      } catch (err) {
        console.error("vocab: failed to create deck", err);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-3.5" />
          New deck
        </Button>
      </DialogTrigger>
      <DialogContent
        title="New deck"
        description="A list of words you can drill — pin it to the sidebar for one-tap access, or file it into a book."
      >
        <form onSubmit={onSubmit} className="flex items-center gap-2">
          <Input
            name="name"
            required
            autoFocus
            maxLength={80}
            placeholder="FF7 vocab · Travel phrases · …"
            aria-label="Deck name"
          />
          <Button type="submit" variant="primary" loading={pending}>
            Create
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BookRow({ list }: { list: DeckSummaryRow }) {
  const router = useRouter();
  const [renaming, setRenaming] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const commitRename = (name: string) => {
    startTransition(async () => {
      try {
        await renameStudyDeck(list.id, name);
      } catch (err) {
        console.error("vocab: failed to rename book", err);
      }
    });
  };

  return (
    <li className="book-row group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-hover sm:px-4">
      <BookTile name={list.name} className="w-11 shrink-0" />
      {renaming ? (
        <InlineRenameInput
          initialValue={list.name}
          ariaLabel="Rename book"
          onCommit={commitRename}
          onClose={() => setRenaming(false)}
          className="min-w-0 flex-1 text-[0.9375rem]"
        />
      ) : (
        <Link
          href={`/decks/${list.id}`}
          className="min-w-0 flex-1"
        >
          <span className="block truncate text-[0.9375rem] font-medium">
            {list.name}
            {list.pinned && (
              <Pin className="ml-1.5 inline size-3 text-fg-tertiary" />
            )}
          </span>
          <span className="text-[0.8125rem] text-fg-tertiary">
            {list.itemIds.length} word{list.itemIds.length === 1 ? "" : "s"}
            {list.isDefault && (
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
            aria-label={`${list.name} options`}
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
                  await setDefaultStudyDeck(list.id, !list.isDefault);
                  router.refresh();
                } catch (err) {
                  console.error("vocab: failed to set default book", err);
                }
              });
            }}
          >
            {list.isDefault ? (
              <StarOff className="size-4 text-fg-tertiary" />
            ) : (
              <Star className="size-4 text-fg-tertiary" />
            )}
            {list.isDefault ? "Clear default book" : "Make default book"}
          </DropdownItem>
          <DropdownItem
            disabled={pending}
            onSelect={() => {
              startTransition(async () => {
                try {
                  await toggleStudyDeckPin(list.id);
                  router.refresh();
                } catch (err) {
                  console.error("vocab: failed to toggle book pin", err);
                }
              });
            }}
          >
            {list.pinned ? (
              <PinOff className="size-4 text-fg-tertiary" />
            ) : (
              <Pin className="size-4 text-fg-tertiary" />
            )}
            {list.pinned ? "Unpin from sidebar" : "Pin to sidebar"}
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
                  `Delete “${list.name}”? Its words stay in your vocabulary.`,
                )
              )
                return;
              startTransition(async () => {
                try {
                  await deleteStudyDeck(list.id);
                } catch (err) {
                  console.error("vocab: failed to delete book", err);
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
  lists,
  totalWords,
}: {
  lists: DeckSummaryRow[];
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
        {lists.map((list) => (
          <BookRow key={list.id} list={list} />
        ))}
      </ul>

      {lists.length === 0 && (
        <p className="mt-3 text-[0.875rem] text-fg-tertiary">
          No books yet — create one, save a filtered view as a book, or
          import an official one.
        </p>
      )}
    </div>
  );
}
