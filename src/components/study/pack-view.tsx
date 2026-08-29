"use client";

import * as React from "react";
import Link from "next/link";
import {
  BookPlus,
  Check,
  Download,
  ListPlus,
  MoreHorizontal,
  Plus,
  Trash2,
  X,
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

/** What the learner already owns for a pack term: their own vocab row,
 * and which books it's filed in. */
export type SavedEntry = { vocabId: string; bookIds: string[] };
export type PackBook = { id: string; name: string };

/**
 * A curated pack's item list, with the full Spotify-shaped set of copy
 * affordances:
 *
 *   "+"      — add the word to the dictionary (the "liked songs" layer)
 *   "⋯"      — file it into any book, or pull it back out
 *   "Add all"— import every missing word AND save the pack as a book
 *
 * Already-saved words render as ✓, so the pack doubles as a coverage
 * view of the learner's own dictionary. The ✓ is keyed on term +
 * language across the WHOLE dictionary, not on "added from this pack" —
 * which is why removing from a book and removing from the dictionary are
 * deliberately separate actions here: a word showing ✓ may have been
 * added elsewhere and carry review history worth protecting.
 */
export function PackView({
  pack,
  items,
  initialSaved,
  books: initialBooks,
}: {
  pack: StudyPack;
  items: StudyPackItem[];
  initialSaved: Record<string, SavedEntry>;
  books: PackBook[];
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
  const run = (
    item: StudyPackItem,
    op: () => Promise<void>,
    what: string,
  ) => {
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

  const addToDictionary = (item: StudyPackItem) =>
    run(
      item,
      async () => {
        const result = await addStudyPackItem(item.id);
        setSaved((prev) => ({
          ...prev,
          [key(item)]: {
            vocabId: result.vocabId,
            bookIds: prev[key(item)]?.bookIds ?? [],
          },
        }));
      },
      "add",
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
              bookIds: bookIds.includes(listId)
                ? bookIds
                : [...bookIds, listId],
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

  const removeFromDictionary = (item: StudyPackItem) => {
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

  const importAll = () => {
    setError(null);
    startImport(async () => {
      try {
        const result = await importStudyPack(pack.id);
        setImported(result);
        // Every term is now in the dictionary AND in the pack's book, so
        // rebuild saved-state from the ids the action handed back — no
        // reload, which would discard the banner above.
        setBooks((prev) =>
          prev.some((b) => b.id === result.listId)
            ? prev
            : [...prev, { id: result.listId, name: result.list }],
        );
        setSaved((prev) => {
          const next = { ...prev };
          for (const [term, vocabId] of Object.entries(
            result.vocabIdsByTerm,
          )) {
            const bookIds = next[term]?.bookIds ?? [];
            next[term] = {
              vocabId,
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
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button variant="primary" loading={importing} onClick={importAll}>
          <Download className="size-3.5" />
          Add all to my vocabulary
        </Button>
        <span className="text-[0.875rem] text-fg-tertiary">
          {savedCount} of {items.length} already in your dictionary
        </span>
      </div>

      {imported && (
        <p className="mb-4 rounded-md bg-accent-soft px-3 py-2.5 text-[0.875rem] text-accent-text">
          Added {imported.added} new word{imported.added === 1 ? "" : "s"} and
          saved the pack as your “{imported.list}” book —{" "}
          <Link
            href="/vocab"
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

      <ul className="divide-y divide-border rounded-xl bg-surface shadow-card">
        {items.map((item) => {
          const entry = saved[key(item)];
          const isSaved = !!entry;
          const inBooks = books.filter((b) => entry?.bookIds.includes(b.id));
          const notInBooks = books.filter(
            (b) => !entry?.bookIds.includes(b.id),
          );
          return (
            <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
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
                onClick={() => !isSaved && addToDictionary(item)}
                disabled={isSaved || busyId === item.id}
                aria-label={
                  isSaved
                    ? `${item.term} is in your dictionary`
                    : `Add ${item.term} to my dictionary`
                }
                title={isSaved ? "In your dictionary" : "Add to my dictionary"}
                className={
                  isSaved
                    ? "flex size-7 shrink-0 items-center justify-center rounded-md text-accent-text"
                    : "flex size-7 shrink-0 items-center justify-center rounded-md text-fg-tertiary transition-colors hover:bg-surface-hover hover:text-fg"
                }
              >
                {isSaved ? (
                  <Check className="size-4" />
                ) : (
                  <Plus className="size-4" />
                )}
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
                  {notInBooks.map((book) => (
                    <DropdownItem
                      key={book.id}
                      onSelect={() => addToBook(item, book.id)}
                    >
                      <ListPlus className="size-4 text-fg-tertiary" />
                      Add to {book.name}
                    </DropdownItem>
                  ))}
                  <DropdownItem onSelect={() => setNewBookFor(item)}>
                    <BookPlus className="size-4 text-fg-tertiary" />
                    New book…
                  </DropdownItem>
                  {inBooks.length > 0 && <DropdownSeparator />}
                  {inBooks.map((book) => (
                    <DropdownItem
                      key={book.id}
                      onSelect={() => removeFromBook(item, book.id)}
                    >
                      <X className="size-4 text-fg-tertiary" />
                      Remove from {book.name}
                    </DropdownItem>
                  ))}
                  {isSaved && (
                    <>
                      <DropdownSeparator />
                      <DropdownItem
                        className="text-danger"
                        onSelect={() => {
                          // The ✓ means "this term is in your
                          // dictionary", not "you added it here" — so
                          // say what's actually at stake before nuking
                          // a row that may carry review history.
                          if (
                            !window.confirm(
                              `Remove “${item.term}” from your dictionary? This also drops its review progress and takes it out of every book.`,
                            )
                          )
                            return;
                          removeFromDictionary(item);
                        }}
                      >
                        <Trash2 className="size-4" />
                        Remove from my dictionary
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
          description="A themed collection inside your dictionary — the word goes in as its first entry."
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const name = String(
                new FormData(form).get("name") ?? "",
              ).trim();
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
