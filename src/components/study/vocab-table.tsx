"use client";

import * as React from "react";
import { formatDistanceToNow } from "date-fns";
import { ArrowDown, ArrowUp, Check, Download, Pencil, X } from "lucide-react";
import type { StudyVocabItem } from "@/db";
import { deleteStudyVocab, updateStudyVocab } from "@/lib/actions/study";
import { Badge, vocabularyStatusTone } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input, Select } from "@/components/ui/field";
import { isCardDue } from "@/lib/srs";
import { STUDY_LANGUAGES } from "@/lib/study-languages";
import { cn } from "@/lib/utils";

type SortKey = "term" | "language" | "status" | "due" | "reps";
type SortDir = "asc" | "desc";
type Sort = { key: SortKey; dir: SortDir };

const STATUS_ORDER: Record<StudyVocabItem["status"], number> = {
  new: 0,
  learning: 1,
  reviewing: 2,
  mastered: 3,
};

const SORT_KEYS: SortKey[] = ["term", "language", "status", "due", "reps"];

const SORT_LABELS: Record<SortKey, string> = {
  term: "Term",
  language: "Language",
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
type Draft = Record<DraftField, string> & { language: string };

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

export function VocabTable({ items }: { items: StudyVocabItem[] }) {
  const [language, setLanguage] = React.useState("all");
  const [sort, setSort] = React.useState<Sort | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  // Per-ROW busy state, not one flag for the table: a save on one word must
  // never freeze the buttons on every other row.
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [, startTransition] = React.useTransition();
  const now = new Date();

  const languages = [...new Set(items.map((i) => i.language))].sort();

  const visible = items.filter(
    (i) => language === "all" || i.language === language,
  );
  if (sort) {
    const factor = sort.dir === "asc" ? 1 : -1;
    visible.sort((a, b) => factor * compare(a, b, sort.key));
  }

  const onSortHeader = (key: SortKey) => {
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

  // Rendered by CALLING these (not as <Components/>): a component defined
  // inside a render would get a new identity every keystroke and remount
  // the input, losing focus mid-edit.
  const sortHeader = (key: SortKey) => {
    const active = sort?.key === key;
    return (
      <th
        aria-sort={
          active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
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
            (sort.dir === "asc" ? (
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

  const rowActions = (item: StudyVocabItem) => (
    <>
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
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {languages.length > 1 && (
          <div className="flex flex-wrap items-center gap-1">
            {["all", ...languages].map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setLanguage(f)}
                className={cn(
                  "rounded-md px-2 py-1 text-[0.8125rem] font-medium capitalize transition-colors",
                  language === f
                    ? "bg-accent-soft text-accent-text"
                    : "text-fg-secondary hover:bg-surface-hover",
                )}
              >
                {f}
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

        <a
          href="/study/vocab/export.csv"
          download
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 text-[0.875rem] font-medium shadow-sm transition-colors hover:bg-surface-hover"
        >
          <Download className="size-3.5" />
          Export CSV
        </a>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-3 rounded-md bg-danger-soft px-3 py-2 text-[0.875rem] text-danger"
        >
          {error}
        </p>
      )}

      {/* Phone layout: cards. The table below is display:none here — role
          queries skip it, but getByText does NOT, so scope text assertions
          to a card (or a row) rather than the page. */}
      <ul className="space-y-2 sm:hidden">
        {visible.map((item) => {
          const editing = editingId === item.id && draft;
          return (
            <li key={item.id} className="rounded-lg bg-surface p-3 shadow-card">
              {editing ? (
                <div className="space-y-2">
                  {EDIT_FIELDS.map((field) => (
                    <div key={field.key}>{draftInput(field, item)}</div>
                  ))}
                  {languageSelect(item)}
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
                      {rowActions(item)}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-fg-tertiary">
                    <StatusBadge item={item} />
                    <span>{item.language}</span>
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
            No words match this filter.
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
              {sortHeader("status")}
              {sortHeader("due")}
              {sortHeader("reps")}
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {visible.map((item) => {
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
                      {editing ? editActions(item) : rowActions(item)}
                    </div>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center text-fg-tertiary"
                >
                  No words match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
