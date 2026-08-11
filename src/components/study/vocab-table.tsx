"use client";

import * as React from "react";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Download,
  ListPlus,
  Pencil,
  X,
} from "lucide-react";
import type { StudyVocabItem } from "@/db";
import {
  addToStudyVocabList,
  createStudyVocabList,
  deleteStudyVocab,
  deleteStudyVocabList,
  moveStudyVocabListItem,
  removeFromStudyVocabList,
  renameStudyVocabList,
  updateStudyVocab,
} from "@/lib/actions/study";
import { Badge, vocabularyStatusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { Input, Select } from "@/components/ui/field";
import { isCardDue } from "@/lib/srs";
import { STUDY_LANGUAGES } from "@/lib/study-languages";
import { STUDY_VOCAB_CATEGORIES } from "@/lib/study-vocab-categories";
import { cn } from "@/lib/utils";

/** A list with its member ids in the learner's manual order. */
export type VocabListSummary = {
  id: string;
  name: string;
  itemIds: string[];
};

type SortKey = "term" | "language" | "category" | "status" | "due" | "reps";
type SortDir = "asc" | "desc";
type Sort = { key: SortKey; dir: SortDir };

const STATUS_ORDER: Record<StudyVocabItem["status"], number> = {
  new: 0,
  learning: 1,
  reviewing: 2,
  mastered: 3,
};

const SORT_KEYS: SortKey[] = [
  "term",
  "language",
  "category",
  "status",
  "due",
  "reps",
];

const SORT_LABELS: Record<SortKey, string> = {
  term: "Term",
  language: "Language",
  category: "Category",
  status: "Status",
  due: "Due",
  reps: "Reps",
};

/**
 * The editable columns. SRS state (status / due / reps) is derived from
 * review evidence and is never hand-edited — it is display-only here.
 *
 * `label` is the accessible name in BOTH layouts (the phone cards and the
 * desktop table render the same field twice, one of them hidden). It is
 * prefixed "Edit " so it never collides with the add form's own labels.
 */
const EDIT_FIELDS = [
  { key: "term", label: "Edit term", placeholder: "Term", maxLength: 200 },
  { key: "reading", label: "Edit reading", placeholder: "Reading", maxLength: 200 },
  { key: "meaning", label: "Edit meaning", placeholder: "Meaning", maxLength: 500 },
  { key: "example", label: "Edit example", placeholder: "Example", maxLength: 1000 },
] as const;

type DraftField = (typeof EDIT_FIELDS)[number]["key"];
type Draft = Record<DraftField, string> & { language: string; category: string };

/** A null srsDueAt (never reviewed) is always due — sorts first. */
function dueValue(item: StudyVocabItem): number {
  return item.srsDueAt ? item.srsDueAt.getTime() : 0;
}

function compare(a: StudyVocabItem, b: StudyVocabItem, key: SortKey): number {
  switch (key) {
    case "term":
      return a.term.localeCompare(b.term);
    case "language":
      return a.language.localeCompare(b.language);
    case "category": {
      // Uncategorized sorts last so real categories cluster on top.
      if (!a.category && !b.category) return 0;
      if (!a.category) return 1;
      if (!b.category) return -1;
      return a.category.localeCompare(b.category);
    }
    case "status":
      return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    case "due":
      return dueValue(a) - dueValue(b);
    case "reps":
      return a.srsReps - b.srsReps;
  }
}

function StatusBadge({ item }: { item: StudyVocabItem }) {
  return (
    <Badge tone={vocabularyStatusTone[item.status]}>{item.status}</Badge>
  );
}

function DueLabel({ item, now }: { item: StudyVocabItem; now: Date }) {
  if (isCardDue(item.srsDueAt, now)) {
    return <span className="font-medium text-accent-text">now</span>;
  }
  return (
    <span className="text-fg-secondary">
      {formatDistanceToNow(item.srsDueAt!, { addSuffix: true })}
    </span>
  );
}

const chipClass = (active: boolean) =>
  cn(
    "rounded-md px-2 py-1 text-[0.8125rem] font-medium capitalize transition-colors",
    active
      ? "bg-accent-soft text-accent-text"
      : "text-fg-secondary hover:bg-surface-hover",
  );

export function VocabTable({
  items,
  lists,
}: {
  items: StudyVocabItem[];
  lists: VocabListSummary[];
}) {
  const [language, setLanguage] = React.useState("all");
  const [category, setCategory] = React.useState("all");
  /** "all" = the filterable table; a list id = that list, manual order. */
  const [view, setView] = React.useState("all");
  const [sort, setSort] = React.useState<Sort | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  // Per-ROW busy state, not one flag for the table: a save on one word must
  // never freeze the buttons on every other row.
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saveListOpen, setSaveListOpen] = React.useState(false);
  const [saveListName, setSaveListName] = React.useState("");
  const [renamingList, setRenamingList] = React.useState(false);
  const [listNameDraft, setListNameDraft] = React.useState("");
  const [, startTransition] = React.useTransition();
  const now = new Date();

  const activeList =
    view === "all" ? null : (lists.find((l) => l.id === view) ?? null);
  // A deleted list can linger in state for one render — fall back to all.
  const inListView = activeList !== null;

  const languages = [...new Set(items.map((i) => i.language))].sort();
  const categories = [
    ...new Set(items.map((i) => i.category).filter((c): c is string => !!c)),
  ].sort();

  const byId = new Map(items.map((i) => [i.id, i]));
  let visible: StudyVocabItem[];
  if (inListView) {
    visible = activeList.itemIds
      .map((id) => byId.get(id))
      .filter((i): i is StudyVocabItem => !!i);
  } else {
    visible = items.filter(
      (i) =>
        (language === "all" || i.language === language) &&
        (category === "all" || i.category === category),
    );
    if (sort) {
      const factor = sort.dir === "asc" ? 1 : -1;
      visible.sort((a, b) => factor * compare(a, b, sort.key));
    }
  }

  const onSortHeader = (key: SortKey) => {
    if (inListView) return; // list order is the learner's, not a sort
    setSort((prev) =>
      prev?.key === key
        ? prev.dir === "asc"
          ? { key, dir: "desc" }
          : null
        : { key, dir: "asc" },
    );
  };

  const startEdit = (item: StudyVocabItem) => {
    setError(null);
    setEditingId(item.id);
    setDraft({
      term: item.term,
      reading: item.reading ?? "",
      meaning: item.meaning ?? "",
      example: item.example ?? "",
      language: item.language,
      category: item.category ?? "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const setField = (field: keyof Draft, value: string) =>
    setDraft((d) => (d ? { ...d, [field]: value } : d));

  const saveEdit = (item: StudyVocabItem) => {
    if (!draft || !draft.term.trim()) return;
    const patch = draft;
    setError(null);
    setBusyId(item.id);
    startTransition(async () => {
      try {
        await updateStudyVocab(item.id, {
          language: patch.language,
          term: patch.term,
          reading: patch.reading || undefined,
          meaning: patch.meaning || undefined,
          example: patch.example || undefined,
          category: patch.category || undefined,
        });
        setEditingId(null);
        setDraft(null);
      } catch (err) {
        // Never silent: a rejected action would otherwise leave the row
        // sitting in edit mode with no explanation.
        console.error("vocab table: failed to save word", err);
        setError(
          `Couldn't save “${patch.term}” — nothing was changed. Try again.`,
        );
      } finally {
        setBusyId(null);
      }
    });
  };

  const saveAsList = () => {
    const name = saveListName.trim();
    if (!name || visible.length === 0) return;
    const ids = visible.map((i) => i.id);
    setError(null);
    startTransition(async () => {
      try {
        const { id } = await createStudyVocabList(name, ids);
        setSaveListOpen(false);
        setSaveListName("");
        setView(id);
      } catch (err) {
        console.error("vocab table: failed to create list", err);
        setError(`Couldn't create “${name}” — try again.`);
      }
    });
  };

  const commitListRename = () => {
    if (!activeList) return;
    const name = listNameDraft.trim();
    setRenamingList(false);
    if (!name || name === activeList.name) return;
    startTransition(async () => {
      try {
        await renameStudyVocabList(activeList.id, name);
      } catch (err) {
        console.error("vocab table: failed to rename list", err);
        setError("Couldn't rename the list — try again.");
      }
    });
  };

  const moveInList = (item: StudyVocabItem, direction: "up" | "down") => {
    if (!activeList) return;
    setBusyId(item.id);
    startTransition(async () => {
      try {
        await moveStudyVocabListItem(activeList.id, item.id, direction);
      } catch (err) {
        console.error("vocab table: failed to reorder list item", err);
        setError("Couldn't reorder — try again.");
      } finally {
        setBusyId(null);
      }
    });
  };

  const removeFromList = (item: StudyVocabItem) => {
    if (!activeList) return;
    setBusyId(item.id);
    startTransition(async () => {
      try {
        await removeFromStudyVocabList(activeList.id, item.id);
      } catch (err) {
        console.error("vocab table: failed to remove from list", err);
        setError("Couldn't remove the word — try again.");
      } finally {
        setBusyId(null);
      }
    });
  };

  /**
   * Enter saves, Escape cancels. The isComposing guard is load-bearing for
   * this app: committing a Japanese IME candidate fires Enter too, and
   * without it the first kanji conversion would submit the row.
   */
  const onEditKeyDown = (
    event: React.KeyboardEvent<HTMLElement>,
    item: StudyVocabItem,
  ) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelEdit();
      return;
    }
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      saveEdit(item);
    }
  };

  const languageOptions =
    draft && !(STUDY_LANGUAGES as readonly string[]).includes(draft.language)
      ? [draft.language, ...STUDY_LANGUAGES]
      : [...STUDY_LANGUAGES];

  const draftInput = (
    field: (typeof EDIT_FIELDS)[number],
    item: StudyVocabItem,
    className?: string,
  ) =>
    draft && (
      <Input
        aria-label={field.label}
        placeholder={field.placeholder}
        value={draft[field.key]}
        maxLength={field.maxLength}
        onChange={(e) => setField(field.key, e.target.value)}
        onKeyDown={(e) => onEditKeyDown(e, item)}
        className={className}
      />
    );

  const languageSelect = (item: StudyVocabItem, className?: string) =>
    draft && (
      <Select
        aria-label="Edit language"
        value={draft.language}
        onChange={(e) => setField("language", e.target.value)}
        onKeyDown={(e) => onEditKeyDown(e, item)}
        className={className}
      >
        {languageOptions.map((lang) => (
          <option key={lang} value={lang}>
            {lang}
          </option>
        ))}
      </Select>
    );

  const categorySelect = (item: StudyVocabItem, className?: string) =>
    draft && (
      <Select
        aria-label="Edit category"
        value={draft.category}
        onChange={(e) => setField("category", e.target.value)}
        onKeyDown={(e) => onEditKeyDown(e, item)}
        className={className}
      >
        <option value="">No category</option>
        {STUDY_VOCAB_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </Select>
    );

  // Rendered by CALLING these (not as <Components/>): a component defined
  // inside a render would get a new identity every keystroke and remount
  // the input, losing focus mid-edit.
  const sortHeader = (key: SortKey) => {
    const active = !inListView && sort?.key === key;
    return (
      <th
        aria-sort={
          active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"
        }
        className="px-4 py-2.5 font-medium"
      >
        <button
          type="button"
          onClick={() => onSortHeader(key)}
          className={cn(
            "inline-flex items-center gap-1 rounded-sm transition-colors hover:text-fg",
            active && "text-fg",
          )}
        >
          {SORT_LABELS[key]}
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

  const editActions = (item: StudyVocabItem) => (
    <>
      <button
        type="button"
        title="Save word"
        disabled={busyId === item.id || !draft?.term.trim()}
        onClick={() => saveEdit(item)}
        className="flex size-7 items-center justify-center rounded-md text-accent-text transition-colors hover:bg-accent-soft disabled:opacity-50"
      >
        <Check className="size-4" />
      </button>
      <button
        type="button"
        title="Cancel edit"
        disabled={busyId === item.id}
        onClick={cancelEdit}
        className="flex size-7 items-center justify-center rounded-md text-fg-tertiary transition-colors hover:bg-surface-hover hover:text-fg"
      >
        <X className="size-4" />
      </button>
    </>
  );

  const rowActions = (item: StudyVocabItem, index: number) => (
    <>
      {inListView && (
        <>
          <button
            type="button"
            title="Move up"
            disabled={busyId === item.id || index === 0}
            onClick={() => moveInList(item, "up")}
            className="flex size-7 items-center justify-center rounded-md text-fg-tertiary transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-30"
          >
            <ArrowUp className="size-3.5" />
          </button>
          <button
            type="button"
            title="Move down"
            disabled={busyId === item.id || index === visible.length - 1}
            onClick={() => moveInList(item, "down")}
            className="flex size-7 items-center justify-center rounded-md text-fg-tertiary transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-30"
          >
            <ArrowDown className="size-3.5" />
          </button>
          <button
            type="button"
            title="Remove from list"
            disabled={busyId === item.id}
            onClick={() => removeFromList(item)}
            className="flex size-7 items-center justify-center rounded-md text-fg-tertiary transition-colors hover:bg-surface-hover hover:text-danger"
          >
            <X className="size-4" />
          </button>
        </>
      )}
      {!inListView && lists.length > 0 && (
        <Dropdown>
          <DropdownTrigger asChild>
            <button
              type="button"
              title="Add to list"
              disabled={busyId === item.id}
              className="flex size-7 items-center justify-center rounded-md text-fg-tertiary transition-colors hover:bg-surface-hover hover:text-fg"
            >
              <ListPlus className="size-3.5" />
            </button>
          </DropdownTrigger>
          <DropdownContent align="start" className="w-48">
            {lists.map((list) => (
              <DropdownItem
                key={list.id}
                disabled={list.itemIds.includes(item.id)}
                className={cn(
                  list.itemIds.includes(item.id) && "opacity-50",
                )}
                onSelect={() => {
                  startTransition(async () => {
                    try {
                      await addToStudyVocabList(list.id, item.id);
                    } catch (err) {
                      console.error("vocab table: failed to add to list", err);
                      setError("Couldn't add the word to the list — try again.");
                    }
                  });
                }}
              >
                {list.name}
              </DropdownItem>
            ))}
          </DropdownContent>
        </Dropdown>
      )}
      <button
        type="button"
        title="Edit word"
        disabled={busyId === item.id}
        onClick={() => startEdit(item)}
        className="flex size-7 items-center justify-center rounded-md text-fg-tertiary transition-colors hover:bg-surface-hover hover:text-fg"
      >
        <Pencil className="size-3.5" />
      </button>
      {/* Two-step delete (arms, then fires) — the repo's confirm pattern, and
          the trash icon now sits one tap from the pencil. */}
      <ConfirmButton
        title="Delete word"
        action={() => deleteStudyVocab(item.id)}
      />
    </>
  );

  return (
    <div>
      {/* Lists row — the table's saved views. "All words" is the live
          filterable table; a list is a manual, reorderable selection. */}
      {(lists.length > 0 || items.length > 0) && (
        <div className="mb-2 flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setView("all");
              setRenamingList(false);
            }}
            className={chipClass(!inListView)}
          >
            All words
          </button>
          {lists.map((list) =>
            activeList?.id === list.id && renamingList ? (
              <input
                key={list.id}
                autoFocus
                value={listNameDraft}
                onChange={(e) => setListNameDraft(e.target.value)}
                onBlur={commitListRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    commitListRename();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setRenamingList(false);
                  }
                }}
                maxLength={80}
                aria-label="Rename list"
                className="h-7 rounded-md border border-accent bg-transparent px-2 text-[0.8125rem] focus:outline-none"
              />
            ) : (
              <button
                key={list.id}
                type="button"
                onClick={() => setView(list.id)}
                className={chipClass(activeList?.id === list.id)}
              >
                {list.name}
                <span className="ml-1 text-fg-tertiary">
                  {list.itemIds.length}
                </span>
              </button>
            ),
          )}
          {inListView && !renamingList && (
            <>
              <button
                type="button"
                title="Rename list"
                onClick={() => {
                  setListNameDraft(activeList.name);
                  setRenamingList(true);
                }}
                className="flex size-7 items-center justify-center rounded-md text-fg-tertiary transition-colors hover:bg-surface-hover hover:text-fg"
              >
                <Pencil className="size-3.5" />
              </button>
              <ConfirmButton
                title="Delete list"
                action={async () => {
                  await deleteStudyVocabList(activeList.id);
                  setView("all");
                }}
              />
            </>
          )}
        </div>
      )}

      {!inListView && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {languages.length > 1 && (
            <div className="flex flex-wrap items-center gap-1">
              {["all", ...languages].map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setLanguage(f)}
                  className={chipClass(language === f)}
                >
                  {f}
                </button>
              ))}
            </div>
          )}

          {/* Category chips — the "show me my verbs" cut. Only offered
              once at least one word is categorized. */}
          {categories.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 border-l border-border pl-2">
              {["all", ...categories].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={chipClass(category === c)}
                >
                  {c === "all" ? "any type" : c}
                </button>
              ))}
            </div>
          )}

          {/* Phones have no column headers to click — sorting gets its own
              control inside the viewport branch that needs it. */}
          <div className="flex items-center gap-1 sm:hidden">
            <div className="w-32">
              <Select
                aria-label="Sort by"
                value={sort?.key ?? ""}
                onChange={(e) =>
                  setSort(
                    e.target.value
                      ? { key: e.target.value as SortKey, dir: sort?.dir ?? "asc" }
                      : null,
                  )
                }
              >
                <option value="">Newest</option>
                {SORT_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {SORT_LABELS[key]}
                  </option>
                ))}
              </Select>
            </div>
            {sort && (
              <button
                type="button"
                title={sort.dir === "asc" ? "Sort descending" : "Sort ascending"}
                onClick={() =>
                  setSort({
                    key: sort.key,
                    dir: sort.dir === "asc" ? "desc" : "asc",
                  })
                }
                className="flex size-8 items-center justify-center rounded-md border border-border-strong bg-surface text-fg-secondary shadow-sm transition-colors hover:bg-surface-hover"
              >
                {sort.dir === "asc" ? (
                  <ArrowUp className="size-3.5" />
                ) : (
                  <ArrowDown className="size-3.5" />
                )}
              </button>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {visible.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSaveListName("");
                  setSaveListOpen(true);
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 text-[0.875rem] font-medium shadow-sm transition-colors hover:bg-surface-hover"
              >
                <ListPlus className="size-3.5" />
                Save as list
              </button>
            )}
            <a
              href="/study/vocab/export.csv"
              download
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 text-[0.875rem] font-medium shadow-sm transition-colors hover:bg-surface-hover"
            >
              <Download className="size-3.5" />
              Export CSV
            </a>
          </div>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mb-3 rounded-md bg-danger-soft px-3 py-2 text-[0.875rem] text-danger"
        >
          {error}
        </p>
      )}

      {/* Save-as-list: names the CURRENT view (filters + sort applied) and
          keeps its order as the list's starting order. */}
      <Dialog open={saveListOpen} onOpenChange={setSaveListOpen}>
        <DialogContent
          title="Save as list"
          description={`The ${visible.length} word${visible.length === 1 ? "" : "s"} in the current view, in this order.`}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveAsList();
            }}
            className="flex items-center gap-2"
          >
            <Input
              autoFocus
              value={saveListName}
              onChange={(e) => setSaveListName(e.target.value)}
              maxLength={80}
              placeholder="Common French verbs"
              aria-label="List name"
            />
            <Button
              type="submit"
              variant="primary"
              disabled={!saveListName.trim()}
            >
              Save
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Phone layout: cards. The table below is display:none here — role
          queries skip it, but getByText does NOT, so scope text assertions
          to a card (or a row) rather than the page. */}
      <ul className="space-y-2 sm:hidden">
        {visible.map((item, index) => {
          const editing = editingId === item.id && draft;
          return (
            <li key={item.id} className="rounded-lg bg-surface p-3 shadow-card">
              {editing ? (
                <div className="space-y-2">
                  {EDIT_FIELDS.map((field) => (
                    <div key={field.key}>{draftInput(field, item)}</div>
                  ))}
                  {languageSelect(item)}
                  {categorySelect(item)}
                  <div className="flex items-center justify-end gap-1">
                    {editActions(item)}
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.9375rem]">
                        <span className="font-semibold">{item.term}</span>
                        {item.reading && (
                          <span className="ml-1.5 text-fg-secondary">
                            [{item.reading}]
                          </span>
                        )}
                        {item.meaning && (
                          <span className="text-fg-secondary">
                            {" "}
                            — {item.meaning}
                          </span>
                        )}
                      </p>
                      {item.example && (
                        <p className="mt-0.5 text-[0.875rem] text-fg-tertiary italic">
                          {item.example}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {rowActions(item, index)}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-fg-tertiary">
                    <StatusBadge item={item} />
                    <span>{item.language}</span>
                    {item.category && <span>{item.category}</span>}
                    <span>
                      due <DueLabel item={item} now={now} />
                    </span>
                    <span>
                      {item.srsReps} rep{item.srsReps === 1 ? "" : "s"}
                    </span>
                  </div>
                </>
              )}
            </li>
          );
        })}
        {visible.length === 0 && (
          <li className="rounded-lg bg-surface px-4 py-8 text-center text-fg-tertiary shadow-card">
            {inListView
              ? "This list is empty — add words from the table."
              : "No words match this filter."}
          </li>
        )}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl bg-surface shadow-card sm:block">
        <table className="w-full text-[0.9375rem]">
          <thead>
            <tr className="border-b border-border text-left text-[0.8125rem] font-medium text-fg-tertiary">
              {sortHeader("term")}
              <th className="px-4 py-2.5 font-medium">Reading</th>
              <th className="px-4 py-2.5 font-medium">Meaning</th>
              {sortHeader("language")}
              {sortHeader("category")}
              {sortHeader("status")}
              {sortHeader("due")}
              {sortHeader("reps")}
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {visible.map((item, index) => {
              const editing = editingId === item.id && draft;
              return (
                <tr
                  key={item.id}
                  className="border-b border-border align-top last:border-0"
                >
                  {editing ? (
                    <>
                      <td className="px-4 py-2">
                        {draftInput(EDIT_FIELDS[0], item, "min-w-32")}
                      </td>
                      <td className="px-4 py-2">
                        {draftInput(EDIT_FIELDS[1], item, "min-w-24")}
                      </td>
                      <td className="px-4 py-2">
                        {draftInput(EDIT_FIELDS[2], item, "min-w-40")}
                        <div className="mt-1.5">
                          {draftInput(EDIT_FIELDS[3], item, "min-w-40")}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        {languageSelect(item, "min-w-28")}
                      </td>
                      <td className="px-4 py-2">
                        {categorySelect(item, "min-w-28")}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2.5 font-medium">{item.term}</td>
                      <td className="px-4 py-2.5 text-fg-secondary">
                        {item.reading ?? "—"}
                      </td>
                      <td className="max-w-64 px-4 py-2.5 text-fg-secondary">
                        {item.meaning ?? "—"}
                        {item.example && (
                          <span className="mt-0.5 block truncate text-[0.875rem] text-fg-tertiary italic">
                            {item.example}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-fg-secondary">
                        {item.language}
                      </td>
                      <td className="px-4 py-2.5 text-fg-secondary">
                        {item.category ?? "—"}
                      </td>
                    </>
                  )}
                  <td className="px-4 py-2.5">
                    <StatusBadge item={item} />
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <DueLabel item={item} now={now} />
                  </td>
                  <td className="px-4 py-2.5 text-fg-secondary">
                    {item.srsReps}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      {editing ? editActions(item) : rowActions(item, index)}
                    </div>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-8 text-center text-fg-tertiary"
                >
                  {inListView
                    ? "This list is empty — add words from the table."
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
