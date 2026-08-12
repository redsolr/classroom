"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  Download,
  Eye,
  EyeOff,
  ListPlus,
  MoreHorizontal,
  Pencil,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import type { StudyVocabItem } from "@/db";
import {
  addToStudyVocabList,
  createStudyVocabList,
  deleteStudyVocab,
  reorderStudyVocabListItem,
  removeFromStudyVocabList,
  updateStudyVocab,
} from "@/lib/actions/study";
import { Badge, vocabularyStatusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { Input, Select } from "@/components/ui/field";
import { WordFormDialog } from "@/components/study/word-form-dialog";
import { cn } from "@/lib/utils";

/** A book with its member ids in the learner's manual order. */
export type VocabListSummary = {
  id: string;
  name: string;
  pinned: boolean;
  itemIds: string[];
};

/**
 * The dictionary table — compact, Attio-style, ONE layout for every
 * viewport (it scrolls sideways on phones instead of forking into
 * cards). A quick-lookup surface: no SRS columns (due/reps live on the
 * Review page); which columns show is the learner's choice, persisted
 * locally; quiz mode hides meanings until a row is tapped.
 */

const OPTIONAL_COLUMNS = [
  { key: "reading", label: "Reading" },
  { key: "meaning", label: "Meaning" },
  { key: "category", label: "Type" },
  { key: "language", label: "Language" },
  { key: "status", label: "Status" },
] as const;
type ColumnKey = (typeof OPTIONAL_COLUMNS)[number]["key"];

const DEFAULT_COLUMNS: ColumnKey[] = ["reading", "meaning"];
const COLUMNS_STORAGE_KEY = "classroom-vocab-columns";

function parseStoredColumns(raw: string | null): ColumnKey[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const valid = OPTIONAL_COLUMNS.map((c) => c.key);
    return parsed.filter((k): k is ColumnKey =>
      valid.includes(k as ColumnKey),
    );
  } catch {
    return null;
  }
}

type SortKey = "term" | ColumnKey;
type Sort = { key: SortKey; dir: "asc" | "desc" };

const STATUS_ORDER: Record<StudyVocabItem["status"], number> = {
  new: 0,
  learning: 1,
  reviewing: 2,
  mastered: 3,
};

function compare(a: StudyVocabItem, b: StudyVocabItem, key: SortKey): number {
  const text = (v: string | null) => v ?? "";
  switch (key) {
    case "term":
      return a.term.localeCompare(b.term);
    case "reading":
      return text(a.reading).localeCompare(text(b.reading));
    case "meaning":
      return text(a.meaning).localeCompare(text(b.meaning));
    case "language":
      return a.language.localeCompare(b.language);
    case "category": {
      if (!a.category && !b.category) return 0;
      if (!a.category) return 1;
      if (!b.category) return -1;
      return a.category.localeCompare(b.category);
    }
    case "status":
      return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  }
}

const toolbarButtonClass =
  "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[0.8125rem] font-medium text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg";

export function VocabTable({
  items,
  lists,
  view,
}: {
  items: StudyVocabItem[];
  lists: VocabListSummary[];
  view: "all" | { id: string; name: string };
}) {
  const book = view === "all" ? null : view;
  const inBook = book !== null;

  // Column choice — read through useSyncExternalStore so server render
  // and hydration agree (defaults), then the stored choice applies.
  const storedColumns = React.useSyncExternalStore(
    React.useCallback((onChange) => {
      window.addEventListener("storage", onChange);
      return () => window.removeEventListener("storage", onChange);
    }, []),
    () => window.localStorage.getItem(COLUMNS_STORAGE_KEY),
    () => null,
  );
  const [columnsOverride, setColumnsOverride] = React.useState<
    ColumnKey[] | null
  >(null);
  const columns =
    columnsOverride ?? parseStoredColumns(storedColumns) ?? DEFAULT_COLUMNS;
  const setColumns = (next: ColumnKey[]) => {
    setColumnsOverride(next);
    window.localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(next));
  };
  const showColumn = (key: ColumnKey) => columns.includes(key);

  const [language, setLanguage] = React.useState("all");
  const [category, setCategory] = React.useState("all");
  const [sort, setSort] = React.useState<Sort | null>(null);
  const [quizMode, setQuizMode] = React.useState(false);
  const [revealed, setRevealed] = React.useState<Set<string>>(() => new Set());
  const [editing, setEditing] = React.useState<StudyVocabItem | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saveBookOpen, setSaveBookOpen] = React.useState(false);
  const [saveBookName, setSaveBookName] = React.useState("");
  const [, startTransition] = React.useTransition();

  const languages = [...new Set(items.map((i) => i.language))].sort();
  const categories = [
    ...new Set(items.map((i) => i.category).filter((c): c is string => !!c)),
  ].sort();

  let visible = items;
  if (!inBook) {
    visible = items.filter(
      (i) =>
        (language === "all" || i.language === language) &&
        (category === "all" || i.category === category),
    );
    if (sort) {
      const factor = sort.dir === "asc" ? 1 : -1;
      visible = [...visible].sort((a, b) => factor * compare(a, b, sort.key));
    }
  }

  const run = (id: string | null, fn: () => Promise<void>, label: string) => {
    setError(null);
    if (id) setBusyId(id);
    startTransition(async () => {
      try {
        await fn();
      } catch (err) {
        console.error(`vocab table: ${label} failed`, err);
        setError("That didn't save — please try again.");
      } finally {
        if (id) setBusyId(null);
      }
    });
  };

  const onSortHeader = (key: SortKey) => {
    if (inBook) return; // a book's order is the learner's, not a sort
    setSort((prev) =>
      prev?.key === key
        ? prev.dir === "asc"
          ? { key, dir: "desc" }
          : null
        : { key, dir: "asc" },
    );
  };

  const sortHeader = (key: SortKey, label: string) => {
    const active = !inBook && sort?.key === key;
    return (
      <th
        key={key}
        aria-sort={
          active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"
        }
        className="px-3 py-2 font-medium whitespace-nowrap"
      >
        <button
          type="button"
          onClick={() => onSortHeader(key)}
          className={cn(
            "inline-flex items-center gap-1 rounded-sm transition-colors hover:text-fg",
            active && "text-fg",
          )}
        >
          {label}
          {active &&
            (sort!.dir === "asc" ? (
              <ArrowUp className="size-3" />
            ) : (
              <ArrowDown className="size-3" />
            ))}
        </button>
      </th>
    );
  };

  const saveAsBook = () => {
    const name = saveBookName.trim();
    if (!name || visible.length === 0) return;
    const ids = visible.map((i) => i.id);
    run(null, async () => {
      await createStudyVocabList(name, ids);
      setSaveBookOpen(false);
      setSaveBookName("");
    }, "save as book");
  };

  const colCount = 1 + columns.length + 1;

  return (
    <div>
      {/* ── Toolbar: one clean row ── */}
      <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
        {!inBook && languages.length > 1 && (
          <Select
            aria-label="Filter language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="h-8 w-auto text-[0.8125rem]"
          >
            <option value="all">All languages</option>
            {languages.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        )}
        {!inBook && categories.length > 0 && (
          <Select
            aria-label="Filter type"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-8 w-auto text-[0.8125rem]"
          >
            <option value="all">Any type</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setQuizMode((q) => !q);
              setRevealed(new Set());
            }}
            aria-pressed={quizMode}
            title={
              quizMode
                ? "Show meanings"
                : "Quiz mode — hide meanings, tap a row to peek"
            }
            className={cn(
              toolbarButtonClass,
              quizMode && "bg-accent-soft text-accent-text",
            )}
          >
            {quizMode ? (
              <Eye className="size-3.5" />
            ) : (
              <EyeOff className="size-3.5" />
            )}
            Quiz
          </button>
          <Dropdown>
            <DropdownTrigger asChild>
              <button
                type="button"
                aria-label="Columns"
                title="Choose columns"
                className={toolbarButtonClass}
              >
                <SlidersHorizontal className="size-3.5" />
                Columns
              </button>
            </DropdownTrigger>
            <DropdownContent className="w-44">
              {OPTIONAL_COLUMNS.map((col) => (
                <DropdownItem
                  key={col.key}
                  onSelect={(e) => {
                    e.preventDefault(); // keep the menu open while toggling
                    setColumns(
                      showColumn(col.key)
                        ? columns.filter((k) => k !== col.key)
                        : [...columns, col.key],
                    );
                  }}
                >
                  <span
                    className={cn(
                      "flex size-4 items-center justify-center rounded border border-border-strong text-[0.7rem]",
                      showColumn(col.key) &&
                        "border-accent bg-accent text-white",
                    )}
                  >
                    {showColumn(col.key) ? "✓" : ""}
                  </span>
                  {col.label}
                </DropdownItem>
              ))}
            </DropdownContent>
          </Dropdown>
          {!inBook && (
            <>
              <button
                type="button"
                onClick={() => {
                  setSaveBookName("");
                  setSaveBookOpen(true);
                }}
                disabled={visible.length === 0}
                title="Save the current view as a book"
                className={toolbarButtonClass}
              >
                <ListPlus className="size-3.5" />
                Save as book
              </button>
              <a
                href="/study/vocab/export.csv"
                download
                title="Export CSV (Anki-ready)"
                aria-label="Export CSV"
                className={toolbarButtonClass}
              >
                <Download className="size-3.5" />
                CSV
              </a>
            </>
          )}
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-2.5 rounded-md bg-danger-soft px-3 py-2 text-[0.875rem] text-danger"
        >
          {error}
        </p>
      )}

      {/* Save-as-book: names the CURRENT view (filters + sort applied),
          keeping its order as the book's starting order. */}
      <Dialog open={saveBookOpen} onOpenChange={setSaveBookOpen}>
        <DialogContent
          title="Save as book"
          description={`The ${visible.length} word${visible.length === 1 ? "" : "s"} in the current view, in this order.`}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveAsBook();
            }}
            className="flex items-center gap-2"
          >
            <Input
              autoFocus
              value={saveBookName}
              onChange={(e) => setSaveBookName(e.target.value)}
              maxLength={80}
              placeholder="Common French verbs"
              aria-label="Book name"
            />
            <Button
              type="submit"
              variant="primary"
              disabled={!saveBookName.trim()}
            >
              Save
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {editing && (
        <EditWordDialog
          item={editing}
          onOpenChange={(next) => {
            if (!next) setEditing(null);
          }}
        />
      )}

      <div className="overflow-x-auto rounded-xl bg-surface shadow-card">
        <table className="w-full text-[0.9375rem]">
          <thead>
            <tr className="border-b border-border text-left text-[0.78rem] font-medium text-fg-tertiary">
              {sortHeader("term", "Word")}
              {OPTIONAL_COLUMNS.filter((c) => showColumn(c.key)).map((c) =>
                sortHeader(c.key, c.label),
              )}
              <th className="w-24 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {visible.map((item, index) => {
              const hidden = quizMode && !revealed.has(item.id);
              return (
                <tr
                  key={item.id}
                  onClick={
                    hidden
                      ? () =>
                          setRevealed((prev) => new Set(prev).add(item.id))
                      : undefined
                  }
                  className={cn(
                    "group border-b border-border last:border-0",
                    hidden && "cursor-pointer",
                  )}
                >
                  <td className="px-3 py-2 font-medium whitespace-nowrap">
                    {item.term}
                  </td>
                  {showColumn("reading") && (
                    <td className="px-3 py-2 text-fg-secondary">
                      {hidden ? (
                        <span className="select-none text-fg-tertiary">···</span>
                      ) : (
                        (item.reading ?? "—")
                      )}
                    </td>
                  )}
                  {showColumn("meaning") && (
                    <td className="max-w-72 px-3 py-2 text-fg-secondary">
                      {hidden ? (
                        <span
                          className="select-none rounded bg-surface-hover px-2 py-0.5 text-[0.8125rem] text-fg-tertiary"
                          title="Tap to reveal"
                        >
                          tap to reveal
                        </span>
                      ) : (
                        <>
                          {item.meaning ?? "—"}
                          {item.example && (
                            <span className="mt-0.5 block truncate text-[0.8125rem] text-fg-tertiary italic">
                              {item.example}
                            </span>
                          )}
                        </>
                      )}
                    </td>
                  )}
                  {showColumn("category") && (
                    <td className="px-3 py-2 text-fg-secondary whitespace-nowrap">
                      {item.category ?? "—"}
                    </td>
                  )}
                  {showColumn("language") && (
                    <td className="px-3 py-2 text-fg-secondary whitespace-nowrap">
                      {item.language}
                    </td>
                  )}
                  {showColumn("status") && (
                    <td className="px-3 py-2">
                      <Badge tone={vocabularyStatusTone[item.status]}>
                        {item.status}
                      </Badge>
                    </td>
                  )}
                  <td className="px-2 py-1.5">
                    <div
                      className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 max-lg:opacity-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {inBook && (
                        <>
                          <button
                            type="button"
                            title="Move up"
                            disabled={busyId === item.id || index === 0}
                            onClick={() =>
                              run(
                                item.id,
                                () =>
                                  reorderStudyVocabListItem(
                                    book!.id,
                                    item.id,
                                    index - 1,
                                  ),
                                "move up",
                              )
                            }
                            className="flex size-7 items-center justify-center rounded-md text-fg-tertiary transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-30"
                          >
                            <ArrowUp className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Move down"
                            disabled={
                              busyId === item.id || index === visible.length - 1
                            }
                            onClick={() =>
                              run(
                                item.id,
                                () =>
                                  reorderStudyVocabListItem(
                                    book!.id,
                                    item.id,
                                    index + 1,
                                  ),
                                "move down",
                              )
                            }
                            className="flex size-7 items-center justify-center rounded-md text-fg-tertiary transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-30"
                          >
                            <ArrowDown className="size-3.5" />
                          </button>
                        </>
                      )}
                      <Dropdown>
                        <DropdownTrigger asChild>
                          <button
                            type="button"
                            aria-label={`${item.term} options`}
                            title="Word options"
                            className="flex size-7 items-center justify-center rounded-md text-fg-tertiary transition-colors hover:bg-surface-hover hover:text-fg data-[state=open]:text-fg"
                          >
                            <MoreHorizontal className="size-3.5" />
                          </button>
                        </DropdownTrigger>
                        <DropdownContent align="start" className="w-48">
                          <DropdownItem onSelect={() => setEditing(item)}>
                            <Pencil className="size-4 text-fg-tertiary" />
                            Edit word
                          </DropdownItem>
                          {inBook ? (
                            <DropdownItem
                              disabled={busyId === item.id}
                              onSelect={() =>
                                run(
                                  item.id,
                                  () =>
                                    removeFromStudyVocabList(
                                      book!.id,
                                      item.id,
                                    ),
                                  "remove from book",
                                )
                              }
                            >
                              <X className="size-4 text-fg-tertiary" />
                              Remove from book
                            </DropdownItem>
                          ) : (
                            lists.map((list) => (
                              <DropdownItem
                                key={list.id}
                                disabled={list.itemIds.includes(item.id)}
                                className={cn(
                                  list.itemIds.includes(item.id) &&
                                    "opacity-50",
                                )}
                                onSelect={() =>
                                  run(
                                    item.id,
                                    () =>
                                      addToStudyVocabList(list.id, item.id),
                                    "add to book",
                                  )
                                }
                              >
                                <ListPlus className="size-4 text-fg-tertiary" />
                                Add to {list.name}
                              </DropdownItem>
                            ))
                          )}
                          <DropdownSeparator />
                          <DropdownItem
                            disabled={busyId === item.id}
                            className="text-danger"
                            onSelect={() => {
                              if (
                                !window.confirm(
                                  `Delete “${item.term}” from your dictionary?`,
                                )
                              )
                                return;
                              run(
                                item.id,
                                () => deleteStudyVocab(item.id),
                                "delete word",
                              );
                            }}
                          >
                            <Trash2 className="size-4" />
                            Delete word
                          </DropdownItem>
                        </DropdownContent>
                      </Dropdown>
                    </div>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td
                  colSpan={colCount}
                  className="px-4 py-8 text-center text-fg-tertiary"
                >
                  {inBook
                    ? "This book is empty — add a word or file existing ones into it."
                    : "No words match this filter."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Full-field editor — the shared word form, controlled. SRS state
 * stays evidence-derived and never appears here. */
function EditWordDialog({
  item,
  onOpenChange,
}: {
  item: StudyVocabItem;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <WordFormDialog
      open
      onOpenChange={onOpenChange}
      title={`Edit “${item.term}”`}
      submitLabel="Save word"
      defaults={item}
      action={async (fd) => {
        await updateStudyVocab(item.id, {
          language: String(fd.get("language") ?? item.language),
          term: String(fd.get("term") ?? "").trim(),
          reading: String(fd.get("reading") ?? "") || undefined,
          meaning: String(fd.get("meaning") ?? "") || undefined,
          example: String(fd.get("example") ?? "") || undefined,
          category: String(fd.get("category") ?? "") || undefined,
        });
      }}
    />
  );
}
