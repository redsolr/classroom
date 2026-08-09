"use client";

import * as React from "react";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Download,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import type { StudyVocabItem } from "@/db";
import { deleteStudyVocab, updateStudyVocab } from "@/lib/actions/study";
import { Badge, vocabularyStatusTone } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/field";
import { isCardDue } from "@/lib/srs";
import { STUDY_LANGUAGES } from "@/lib/study-languages";
import { cn } from "@/lib/utils";

type SortKey = "term" | "language" | "status" | "due" | "reps";
type SortDir = "asc" | "desc";

const STATUS_ORDER: Record<StudyVocabItem["status"], number> = {
  new: 0,
  learning: 1,
  reviewing: 2,
  mastered: 3,
};

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

type Draft = {
  term: string;
  reading: string;
  meaning: string;
  example: string;
  language: string;
};

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: SortDir } | null;
  onSort: (key: SortKey) => void;
}) {
  const active = sort?.key === sortKey;
  return (
    <th className="px-4 py-2.5 font-medium">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm transition-colors hover:text-fg",
          active && "text-fg",
        )}
      >
        {label}
        {active &&
          (sort.dir === "asc" ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          ))}
      </button>
    </th>
  );
}

/**
 * The personal vocabulary as a real table: sortable columns, language
 * filter chips, edit-in-place rows. SRS columns (status/due/reps) are
 * display-only — they stay evidence-derived by the review loop.
 */
export function VocabTable({ items }: { items: StudyVocabItem[] }) {
  const [language, setLanguage] = React.useState("all");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: SortDir } | null>(
    null,
  );
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [pending, startTransition] = React.useTransition();
  const now = new Date();

  const languages = [...new Set(items.map((i) => i.language))].sort();

  const visible = items.filter(
    (i) => language === "all" || i.language === language,
  );
  if (sort) {
    const factor = sort.dir === "asc" ? 1 : -1;
    visible.sort((a, b) => factor * compare(a, b, sort.key));
  }

  const onSort = (key: SortKey) => {
    setSort((prev) =>
      prev?.key === key
        ? prev.dir === "asc"
          ? { key, dir: "desc" }
          : null
        : { key, dir: "asc" },
    );
  };

  const startEdit = (item: StudyVocabItem) => {
    setEditingId(item.id);
    setDraft({
      term: item.term,
      reading: item.reading ?? "",
      meaning: item.meaning ?? "",
      example: item.example ?? "",
      language: item.language,
    });
  };

  const saveEdit = (id: string) => {
    if (!draft) return;
    startTransition(async () => {
      await updateStudyVocab(id, {
        language: draft.language,
        term: draft.term,
        reading: draft.reading || undefined,
        meaning: draft.meaning || undefined,
        example: draft.example || undefined,
      });
      setEditingId(null);
      setDraft(null);
    });
  };

  const remove = (id: string) => {
    startTransition(async () => {
      await deleteStudyVocab(id);
    });
  };

  const setField = (field: keyof Draft, value: string) =>
    setDraft((d) => (d ? { ...d, [field]: value } : d));

  const languageOptions =
    draft && !(STUDY_LANGUAGES as readonly string[]).includes(draft.language)
      ? [draft.language, ...STUDY_LANGUAGES]
      : [...STUDY_LANGUAGES];

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
        <a
          href="/study/vocab/export.csv"
          download
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 text-[0.875rem] font-medium shadow-sm transition-colors hover:bg-surface-hover"
        >
          <Download className="size-3.5" />
          Export CSV
        </a>
      </div>

      <div className="overflow-x-auto rounded-xl bg-surface shadow-card">
        <table className="w-full text-[0.9375rem]">
          <thead>
            <tr className="border-b border-border text-left text-[0.8125rem] font-medium text-fg-tertiary">
              <SortHeader label="Term" sortKey="term" sort={sort} onSort={onSort} />
              <th className="px-4 py-2.5 font-medium">Reading</th>
              <th className="px-4 py-2.5 font-medium">Meaning</th>
              <SortHeader
                label="Language"
                sortKey="language"
                sort={sort}
                onSort={onSort}
              />
              <SortHeader
                label="Status"
                sortKey="status"
                sort={sort}
                onSort={onSort}
              />
              <SortHeader label="Due" sortKey="due" sort={sort} onSort={onSort} />
              <SortHeader label="Reps" sortKey="reps" sort={sort} onSort={onSort} />
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {visible.map((item) => {
              const due = isCardDue(item.srsDueAt, now);
              const editing = editingId === item.id && draft;
              return (
                <tr
                  key={item.id}
                  className="border-b border-border align-top last:border-0"
                >
                  {editing ? (
                    <>
                      <td className="px-4 py-2">
                        <Input
                          aria-label="Edit term"
                          value={draft.term}
                          onChange={(e) => setField("term", e.target.value)}
                          maxLength={200}
                          required
                          className="min-w-32"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          aria-label="Edit reading"
                          value={draft.reading}
                          onChange={(e) => setField("reading", e.target.value)}
                          maxLength={200}
                          className="min-w-24"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          aria-label="Edit meaning"
                          value={draft.meaning}
                          onChange={(e) => setField("meaning", e.target.value)}
                          maxLength={500}
                          className="min-w-40"
                        />
                        <Input
                          aria-label="Edit example"
                          value={draft.example}
                          onChange={(e) => setField("example", e.target.value)}
                          maxLength={1000}
                          placeholder="Example sentence"
                          className="mt-1.5 min-w-40"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Select
                          aria-label="Edit language"
                          value={draft.language}
                          onChange={(e) => setField("language", e.target.value)}
                          className="min-w-28"
                        >
                          {languageOptions.map((lang) => (
                            <option key={lang} value={lang}>
                              {lang}
                            </option>
                          ))}
                        </Select>
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
                    <Badge tone={vocabularyStatusTone[item.status]}>
                      {item.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {due ? (
                      <span className="font-medium text-accent-text">now</span>
                    ) : (
                      <span className="text-fg-secondary">
                        {formatDistanceToNow(item.srsDueAt!, {
                          addSuffix: true,
                        })}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-fg-secondary">
                    {item.srsReps}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      {editing ? (
                        <>
                          <button
                            type="button"
                            title="Save word"
                            disabled={pending || !draft.term.trim()}
                            onClick={() => saveEdit(item.id)}
                            className="flex size-7 items-center justify-center rounded-md text-accent-text transition-colors hover:bg-accent-soft disabled:opacity-50"
                          >
                            <Check className="size-4" />
                          </button>
                          <button
                            type="button"
                            title="Cancel edit"
                            disabled={pending}
                            onClick={() => {
                              setEditingId(null);
                              setDraft(null);
                            }}
                            className="flex size-7 items-center justify-center rounded-md text-fg-tertiary transition-colors hover:bg-surface-hover hover:text-fg"
                          >
                            <X className="size-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            title="Edit word"
                            disabled={pending}
                            onClick={() => startEdit(item)}
                            className="flex size-7 items-center justify-center rounded-md text-fg-tertiary transition-colors hover:bg-surface-hover hover:text-fg"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Delete word"
                            disabled={pending}
                            onClick={() => remove(item.id)}
                            className="flex size-7 items-center justify-center rounded-md text-fg-tertiary transition-colors hover:bg-surface-hover hover:text-danger"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </>
                      )}
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
