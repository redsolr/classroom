"use client";

import * as React from "react";
import Link from "next/link";
import {
  Download,
  Heart,
  MoreHorizontal,
  Play,
  Trash2,
} from "lucide-react";
import type { StudyPack, StudyPackItem } from "@/db";
import {
  addStudyPackItem,
  deleteStudyVocab,
  importStudyPack,
  removeFromStudyVocabList,
} from "@/lib/actions/study";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/field";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { AddToBookMenu } from "@/components/study/add-to-book-menu";
import {
  CollectionHero,
  PlayAction,
} from "@/components/study/collection-hero";
import { PackCover } from "@/components/study/pack-cover";

/** What the learner already owns for a pack term: their own vocab row,
 * which books it's filed in, and whether it carries review history —
 * the last one decides whether un-hearting needs a confirmation. */
export type SavedEntry = {
  vocabId: string;
  bookIds: string[];
  reviewed: boolean;
};
export type PackBook = { id: string; name: string };

/**
 * An OFFICIAL BOOK's word list, with the copy affordances a music
 * library taught everyone to expect:
 *
 *   ♥                 — the word is in your vocabulary. Tap to toggle.
 *   "⋯ → Add to book" — file it into any of your books (✓ = it's there)
 *   "Save as my book" — copy every missing word AND save this as a book
 *   "Practice"        — drill it as a deck, saving nothing
 *
 * The last two are the two doors onto ONE catalog: an official book is
 * the same rows whether you copy it or drill it, so it never has to
 * exist twice.
 *
 * The heart means "in your vocabulary" — the liked layer — keyed on term
 * + language across ALL your words, not on "added from this book". That
 * is why un-hearting a word that carries review history or book
 * membership asks first: the ♥ you're clearing may be something you
 * built elsewhere. A word with neither just goes, no dialog — a like you
 * can't undo cheaply isn't a like.
 */
export function PackView({
  pack,
  items,
  initialSaved,
  books: initialBooks,
  defaultBookName,
}: {
  pack: StudyPack;
  items: StudyPackItem[];
  initialSaved: Record<string, SavedEntry>;
  books: PackBook[];
  /** The learner's default book — a one-tap heart files here too. */
  defaultBookName: string | null;
}) {
  const [saved, setSaved] =
    React.useState<Record<string, SavedEntry>>(initialSaved);
  const [books, setBooks] = React.useState<PackBook[]>(initialBooks);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [imported, setImported] = React.useState<{
    added: number;
    list: string;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [importing, startImport] = React.useTransition();
  const [, startAdd] = React.useTransition();
  /** Pack item awaiting a name for a brand-new book. */
  const [newBookFor, setNewBookFor] = React.useState<StudyPackItem | null>(
    null,
  );

  const key = (item: StudyPackItem) => item.term.toLowerCase();

  /** Every row mutation funnels through here so busy state and error
   * reporting can't drift between the six call sites. */
  const run = (item: StudyPackItem, op: () => Promise<void>, what: string) => {
    setError(null);
    setBusyId(item.id);
    startAdd(async () => {
      try {
        await op();
      } catch (err) {
        console.error(`pack view: failed to ${what}`, err);
        setError(`Couldn't ${what} “${item.term}” — try again.`);
      } finally {
        setBusyId(null);
      }
    });
  };

  const addToVocabulary = (item: StudyPackItem) =>
    run(
      item,
      async () => {
        // No target = the action files it into the default book too,
        // if the learner has set one.
        const result = await addStudyPackItem(item.id);
        setSaved((prev) => {
          const bookIds = prev[key(item)]?.bookIds ?? [];
          return {
            ...prev,
            [key(item)]: {
              vocabId: result.vocabId,
              reviewed: prev[key(item)]?.reviewed ?? false,
              bookIds:
                result.listId && !bookIds.includes(result.listId)
                  ? [...bookIds, result.listId]
                  : bookIds,
            },
          };
        });
      },
      "save",
    );

  const addToBook = (item: StudyPackItem, listId: string) =>
    run(
      item,
      async () => {
        const result = await addStudyPackItem(item.id, { listId });
        setSaved((prev) => {
          const existing = prev[key(item)];
          const bookIds = existing?.bookIds ?? [];
          return {
            ...prev,
            [key(item)]: {
              vocabId: result.vocabId,
              reviewed: existing?.reviewed ?? false,
              bookIds: bookIds.includes(listId) ? bookIds : [...bookIds, listId],
            },
          };
        });
      },
      "file",
    );

  const createBookWith = (item: StudyPackItem, name: string) =>
    run(
      item,
      async () => {
        const result = await addStudyPackItem(item.id, { newListName: name });
        if (result.listId) {
          const created = { id: result.listId, name: result.listName ?? name };
          setBooks((prev) => [...prev, created]);
          setSaved((prev) => ({
            ...prev,
            [key(item)]: {
              vocabId: result.vocabId,
              reviewed: prev[key(item)]?.reviewed ?? false,
              bookIds: [...(prev[key(item)]?.bookIds ?? []), created.id],
            },
          }));
        }
      },
      "create a book for",
    );

  const removeFromBook = (item: StudyPackItem, listId: string) => {
    const entry = saved[key(item)];
    if (!entry) return;
    run(
      item,
      async () => {
        await removeFromStudyVocabList(listId, entry.vocabId);
        setSaved((prev) => {
          const current = prev[key(item)];
          if (!current) return prev;
          return {
            ...prev,
            [key(item)]: {
              ...current,
              bookIds: current.bookIds.filter((id) => id !== listId),
            },
          };
        });
      },
      "remove from the book",
    );
  };

  const removeFromVocabulary = (item: StudyPackItem) => {
    const entry = saved[key(item)];
    if (!entry) return;
    run(
      item,
      async () => {
        await deleteStudyVocab(entry.vocabId);
        setSaved((prev) => {
          const next = { ...prev };
          delete next[key(item)];
          return next;
        });
      },
      "remove",
    );
  };

  /**
   * Un-hearting. Cheap when there's nothing to lose, guarded when there
   * is: a word that carries review progress or sits in books may have
   * arrived from somewhere else entirely.
   */
  const unsave = (item: StudyPackItem) => {
    const entry = saved[key(item)];
    if (!entry) return;
    const stakes = [
      entry.reviewed && "its review progress",
      entry.bookIds.length > 0 &&
        `${entry.bookIds.length} book${entry.bookIds.length === 1 ? "" : "s"}`,
    ].filter(Boolean);
    if (
      stakes.length > 0 &&
      !window.confirm(
        `Remove “${item.term}” from your vocabulary? You also lose ${stakes.join(" and ")}.`,
      )
    )
      return;
    removeFromVocabulary(item);
  };

  const importAll = () => {
    setError(null);
    startImport(async () => {
      try {
        const result = await importStudyPack(pack.id);
        setImported(result);
        // Every term is now in the vocabulary AND in the pack's book, so
        // rebuild saved-state from the ids the action handed back — no
        // reload, which would discard the banner above.
        setBooks((prev) =>
          prev.some((b) => b.id === result.listId)
            ? prev
            : [...prev, { id: result.listId, name: result.list }],
        );
        setSaved((prev) => {
          const next = { ...prev };
          for (const [term, vocabId] of Object.entries(result.vocabIdsByTerm)) {
            const bookIds = next[term]?.bookIds ?? [];
            next[term] = {
              vocabId,
              reviewed: next[term]?.reviewed ?? false,
              bookIds: bookIds.includes(result.listId)
                ? bookIds
                : [...bookIds, result.listId],
            };
          }
          return next;
        });
      } catch (err) {
        console.error("pack view: failed to import pack", err);
        setError("Couldn't import the pack — try again.");
      }
    });
  };

  const savedCount = items.filter((i) => saved[key(i)]).length;

  return (
    <div>
      <CollectionHero
        hueSeed={pack.name}
        cover={
          <PackCover
            slug={pack.slug}
            name={pack.name}
            language={pack.language}
          />
        }
        eyebrow="Official book"
        title={pack.name}
        meta={
          <>
            {pack.language} · {items.length} words · {savedCount} saved
          </>
        }
        description={pack.description}
        actions={
          <>
            {/* Drill it now, decide later whether it's worth keeping. */}
            <PlayAction href={`/decks?pack=${pack.slug}`}>
              <Play className="size-4 fill-current" />
              Practice
            </PlayAction>
            <Button loading={importing} onClick={importAll}>
              <Download className="size-3.5" />
              Save as my book
            </Button>
          </>
        }
      />

      {imported && (
        <p className="mb-4 rounded-md bg-accent-soft px-3 py-2.5 text-[0.875rem] text-accent-text">
          Added {imported.added} new word{imported.added === 1 ? "" : "s"} and
          saved the pack as your “{imported.list}” book —{" "}
          <Link
            href="/books"
            className="font-medium underline underline-offset-2"
          >
            open my books
          </Link>
          .
        </p>
      )}
      {error && (
        <p role="alert" className="mb-4 text-[0.875rem] text-danger">
          {error}
        </p>
      )}

      <ul className="pack-words divide-y divide-border overflow-hidden rounded-xl bg-surface shadow-card">
        {items.map((item) => {
          const entry = saved[key(item)];
          const isSaved = !!entry;
          const inBooks = books.filter((b) => entry?.bookIds.includes(b.id));
          return (
            <li
              key={item.id}
              className="pack-word flex items-center gap-3 px-4 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[0.9375rem]">
                  <span className="font-semibold">{item.term}</span>
                  {item.reading && (
                    <span className="ml-1.5 text-fg-secondary">
                      [{item.reading}]
                    </span>
                  )}
                  {item.meaning && (
                    <span className="text-fg-secondary"> — {item.meaning}</span>
                  )}
                </p>
                {item.example && (
                  <p className="mt-0.5 text-[0.8125rem] text-fg-tertiary italic">
                    {item.example}
                  </p>
                )}
                {inBooks.length > 0 && (
                  <p className="mt-0.5 text-[0.75rem] text-fg-tertiary">
                    In {inBooks.map((b) => b.name).join(" · ")}
                  </p>
                )}
              </div>
              {/* Fixed width + left-aligned so this reads as a COLUMN.
                  Flex alone only lines the RIGHT edges up, which leaves
                  "Noun" / "Adjective" ragged down the left. Rendered even
                  when empty so an uncategorized row can't collapse the
                  column for the rows around it. */}
              <span className="w-24 shrink-0 text-left text-[0.78rem] text-fg-tertiary">
                {item.category ?? ""}
              </span>

              <button
                type="button"
                onClick={() => (isSaved ? unsave(item) : addToVocabulary(item))}
                disabled={busyId === item.id}
                aria-label={
                  isSaved
                    ? `Remove ${item.term} from my vocabulary`
                    : `Save ${item.term} to my vocabulary`
                }
                aria-pressed={isSaved}
                title={
                  isSaved
                    ? "In your vocabulary"
                    : defaultBookName
                      ? `Save to my vocabulary and ${defaultBookName}`
                      : "Save to my vocabulary"
                }
                className={
                  isSaved
                    ? "pack-word-like flex size-8 shrink-0 items-center justify-center rounded-md text-accent-text transition-transform hover:scale-110"
                    : "pack-word-like flex size-8 shrink-0 items-center justify-center rounded-md text-fg-tertiary transition-all hover:scale-110 hover:text-fg"
                }
              >
                <Heart className={isSaved ? "size-4 fill-current" : "size-4"} />
              </button>

              <Dropdown>
                <DropdownTrigger asChild>
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    aria-label={`More actions for ${item.term}`}
                    className="flex size-7 shrink-0 items-center justify-center rounded-md text-fg-tertiary transition-colors hover:bg-surface-hover hover:text-fg"
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                </DropdownTrigger>
                <DropdownContent>
                  <AddToBookMenu
                    books={books}
                    inBookIds={entry?.bookIds ?? []}
                    disabled={busyId === item.id}
                    onToggle={(bookId, isIn) =>
                      isIn ? removeFromBook(item, bookId) : addToBook(item, bookId)
                    }
                    onCreate={() => setNewBookFor(item)}
                  />
                  {isSaved && (
                    <>
                      <DropdownSeparator />
                      <DropdownItem
                        className="text-danger"
                        onSelect={() => unsave(item)}
                      >
                        <Trash2 className="size-4" />
                        Remove from my vocabulary
                      </DropdownItem>
                    </>
                  )}
                </DropdownContent>
              </Dropdown>
            </li>
          );
        })}
      </ul>

      <Dialog
        open={newBookFor !== null}
        onOpenChange={(open) => !open && setNewBookFor(null)}
      >
        <DialogContent
          title="New book"
          description="A collection of words inside your vocabulary — this word goes in as its first entry."
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const name = String(new FormData(form).get("name") ?? "").trim();
              const item = newBookFor;
              if (!name || !item) return;
              setNewBookFor(null);
              createBookWith(item, name);
            }}
            className="flex items-center gap-2"
          >
            <Input
              name="name"
              required
              autoFocus
              maxLength={80}
              placeholder="FF7 vocab · Boss fights · …"
              aria-label="Book name"
            />
            <Button type="submit" variant="primary">
              Create
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
