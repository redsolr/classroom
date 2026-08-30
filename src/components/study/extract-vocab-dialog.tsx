"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { VocabCandidate } from "@/lib/ai/vocab-extract";
import {
  addStudyVocabBulk,
  extractStudyVocab,
} from "@/lib/actions/vocab";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

type Phase =
  | { kind: "loading" }
  | { kind: "review"; candidates: VocabCandidate[]; picked: boolean[] }
  | { kind: "done"; added: number }
  | { kind: "error"; message: string };

/**
 * Chat→vocab bulk extraction, opened from the chat's ⋯ menu. The caller
 * MOUNTS this fresh per open (conditional render, not an `open` flag
 * flip) — extraction then re-scans the WHOLE conversation each time
 * (LLM online, VOCAB-line mock offline) and shows a review list. The
 * learner picks which candidates join their list; extraction itself
 * saves nothing.
 */
export function ExtractVocabDialog({
  threadId,
  onOpenChange,
}: {
  threadId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const [phase, setPhase] = React.useState<Phase>({ kind: "loading" });
  const [saving, startSaving] = React.useTransition();

  React.useEffect(() => {
    // The effect only STARTS the scan — state lands in the async
    // callbacks, guarded against a dialog closed mid-flight.
    let stale = false;
    void extractStudyVocab(threadId)
      .then(({ candidates }) => {
        if (stale) return;
        setPhase({
          kind: "review",
          candidates,
          picked: candidates.map(() => true),
        });
      })
      .catch((err: unknown) => {
        if (stale) return;
        console.error("study chat: vocab extraction failed", err);
        setPhase({
          kind: "error",
          message:
            err instanceof Error && err.message
              ? err.message
              : "Extraction failed — please try again.",
        });
      });
    return () => {
      stale = true;
    };
  }, [threadId]);

  const save = () => {
    if (phase.kind !== "review") return;
    const items = phase.candidates.filter((_, i) => phase.picked[i]);
    if (items.length === 0) return;
    startSaving(async () => {
      try {
        const { added } = await addStudyVocabBulk(threadId, items);
        setPhase({ kind: "done", added });
      } catch (err) {
        console.error("study chat: bulk vocab save failed", err);
        setPhase({
          kind: "error",
          message: "Couldn't save the words — nothing was added. Try again.",
        });
      }
    });
  };

  const pickedCount =
    phase.kind === "review" ? phase.picked.filter(Boolean).length : 0;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        title="Save words from this chat"
        description="Vocabulary found in this conversation — pick what joins your list."
      >
        {phase.kind === "loading" && (
          <p className="flex items-center gap-2 py-2 text-[0.9375rem] text-fg-secondary">
            <Loader2 className="size-4 animate-spin" />
            Reading the conversation…
          </p>
        )}

        {phase.kind === "error" && (
          <p role="alert" className="py-2 text-[0.9375rem] text-danger">
            {phase.message}
          </p>
        )}

        {phase.kind === "review" && phase.candidates.length === 0 && (
          <p className="py-2 text-[0.9375rem] text-fg-secondary">
            No new words found — everything worth keeping is already on
            your list.
          </p>
        )}

        {phase.kind === "review" && phase.candidates.length > 0 && (
          <div>
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {phase.candidates.map((c, i) => (
                <li key={`${c.term}-${i}`}>
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-hover">
                    <input
                      type="checkbox"
                      checked={phase.picked[i]}
                      onChange={(e) =>
                        setPhase({
                          ...phase,
                          picked: phase.picked.map((p, j) =>
                            j === i ? e.target.checked : p,
                          ),
                        })
                      }
                      className="mt-1 size-4 accent-accent"
                    />
                    <span className="min-w-0 text-[0.9375rem]">
                      <span className="font-semibold">{c.term}</span>
                      {c.reading && (
                        <span className="ml-1.5 text-fg-secondary">
                          [{c.reading}]
                        </span>
                      )}
                      {c.meaning && (
                        <span className="text-fg-secondary"> — {c.meaning}</span>
                      )}
                      {c.language && (
                        <span className="ml-1.5 text-[0.8125rem] text-fg-tertiary">
                          · {c.language}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end">
              <Button
                variant="primary"
                loading={saving}
                disabled={pickedCount === 0}
                onClick={save}
              >
                Add {pickedCount} word{pickedCount === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        )}

        {phase.kind === "done" && (
          <div className="py-1">
            <p className="text-[0.9375rem]">
              {phase.added === 0
                ? "Those words were already on your list."
                : `Added ${phase.added} word${phase.added === 1 ? "" : "s"} to your list.`}
            </p>
            <Link
              href="/books"
              className="mt-2 inline-block text-[0.9375rem] font-medium text-accent-text hover:underline"
            >
              Open my vocabulary →
            </Link>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
