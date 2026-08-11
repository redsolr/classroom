"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Download, Plus } from "lucide-react";
import type { StudyPack, StudyPackItem } from "@/db";
import { addStudyPackItem, importStudyPack } from "@/lib/actions/study";
import { Button } from "@/components/ui/button";

/**
 * A curated pack's item list with the two copy affordances: per-word
 * "+" (adds that word to the learner's dictionary) and "Add all"
 * (imports every missing word AND creates/refreshes a personal list in
 * the pack's order). Already-saved words render as checkmarks — the
 * pack doubles as a coverage view of the learner's own dictionary.
 */
export function PackView({
  pack,
  items,
  initialSavedTerms,
}: {
  pack: StudyPack;
  items: StudyPackItem[];
  initialSavedTerms: string[];
}) {
  const [saved, setSaved] = React.useState<Set<string>>(
    () => new Set(initialSavedTerms),
  );
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [imported, setImported] = React.useState<{
    added: number;
    list: string;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [importing, startImport] = React.useTransition();
  const [, startAdd] = React.useTransition();

  const addOne = (item: StudyPackItem) => {
    setError(null);
    setBusyId(item.id);
    startAdd(async () => {
      try {
        await addStudyPackItem(item.id);
        setSaved((prev) => new Set(prev).add(item.term.toLowerCase()));
      } catch (err) {
        console.error("pack view: failed to add item", err);
        setError(`Couldn't add “${item.term}” — try again.`);
      } finally {
        setBusyId(null);
      }
    });
  };

  const importAll = () => {
    setError(null);
    startImport(async () => {
      try {
        const result = await importStudyPack(pack.id);
        setSaved(
          (prev) =>
            new Set([...prev, ...items.map((i) => i.term.toLowerCase())]),
        );
        setImported(result);
      } catch (err) {
        console.error("pack view: failed to import pack", err);
        setError("Couldn't import the pack — try again.");
      }
    });
  };

  const savedCount = items.filter((i) =>
    saved.has(i.term.toLowerCase()),
  ).length;

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
          saved the pack as your “{imported.list}” list —{" "}
          <Link href="/study/vocab" className="font-medium underline underline-offset-2">
            open my vocabulary
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
          const isSaved = saved.has(item.term.toLowerCase());
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
              </div>
              {item.category && (
                <span className="shrink-0 text-[0.78rem] text-fg-tertiary">
                  {item.category}
                </span>
              )}
              <button
                type="button"
                onClick={() => addOne(item)}
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
            </li>
          );
        })}
      </ul>
    </div>
  );
}
