"use client";

import * as React from "react";
import Link from "next/link";
import { PartyPopper } from "lucide-react";
import { reviewStudyVocab } from "@/lib/actions/study";
import type { ReviewGrade } from "@/lib/srs";
import { cn } from "@/lib/utils";

type ReviewCard = {
  id: string;
  language: string;
  term: string;
  reading: string | null;
  meaning: string | null;
  example: string | null;
};

const GRADES: { grade: ReviewGrade; label: string; hint: string }[] = [
  { grade: "again", label: "Again", hint: "forgot it" },
  { grade: "hard", label: "Hard", hint: "barely" },
  { grade: "good", label: "Good", hint: "got it" },
  { grade: "easy", label: "Easy", hint: "instant" },
];

/**
 * Flashcard session over the due deck. Grading calls the server action
 * (SM-2-lite scheduling) and advances locally.
 *
 * The deck is snapshotted INTO STATE on mount: grading triggers a
 * revalidation, and any revalidatePath in a server action makes Next
 * re-render the current page and push a fresh (shrunken) deck prop —
 * consuming the prop directly strands the session mid-deck (learned
 * from e2e: "Card 1 of 2" → completion after one card).
 */
export function StudyReview({ deck: initialDeck }: { deck: ReviewCard[] }) {
  const [deck] = React.useState(initialDeck);
  const [index, setIndex] = React.useState(0);
  const [revealed, setRevealed] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [graded, setGraded] = React.useState(0);

  const card = deck[index];

  if (!card) {
    return (
      <div className="rounded-lg bg-surface px-6 py-10 text-center shadow-card">
        <PartyPopper className="mx-auto mb-3 size-6 text-accent" />
        <h2 className="text-[1.125rem] font-semibold">
          {graded > 0
            ? `Nice — ${graded} card${graded === 1 ? "" : "s"} reviewed.`
            : "Nothing due right now."}
        </h2>
        <p className="mt-1 text-[0.9375rem] text-fg-secondary">
          Come back when more cards are due, or add new words as you chat.
        </p>
        <div className="mt-5 flex justify-center gap-3 text-[0.9375rem] font-medium">
          <Link href="/study" className="text-accent-text hover:underline">
            Back to chat
          </Link>
          <Link
            href="/study/vocab"
            className="text-accent-text hover:underline"
          >
            My vocabulary
          </Link>
        </div>
      </div>
    );
  }

  const grade = (g: ReviewGrade) => {
    startTransition(async () => {
      try {
        await reviewStudyVocab(card.id, g);
        setGraded((n) => n + 1);
        setRevealed(false);
        setIndex((i) => i + 1);
      } catch (error) {
        console.error("study review: failed to grade card", error);
      }
    });
  };

  return (
    <div>
      <p className="mb-3 text-[0.875rem] text-fg-tertiary">
        Card {index + 1} of {deck.length} · {card.language}
      </p>

      <div className="rounded-lg bg-surface px-6 py-10 text-center shadow-card">
        <p className="text-[1.75rem] font-semibold tracking-tight">
          {card.term}
        </p>
        {card.reading && (
          <p className="mt-1 text-[1rem] text-fg-secondary">{card.reading}</p>
        )}

        {revealed ? (
          <div className="mt-6 border-t border-border pt-5">
            <p className="text-[1.125rem]">{card.meaning ?? "—"}</p>
            {card.example && (
              <p className="mt-2 text-[0.9375rem] text-fg-secondary italic">
                {card.example}
              </p>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="mt-6 rounded-md border border-border-strong bg-surface px-4 py-2 text-[0.9375rem] font-medium transition-colors hover:bg-surface-hover"
          >
            Show answer
          </button>
        )}
      </div>

      {revealed && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {GRADES.map(({ grade: g, label, hint }) => (
            <button
              key={g}
              type="button"
              disabled={pending}
              onClick={() => grade(g)}
              className={cn(
                "rounded-md border px-3 py-2.5 text-center transition-colors disabled:opacity-50",
                g === "again"
                  ? "border-border-strong bg-surface text-danger hover:bg-danger-soft"
                  : "border-border-strong bg-surface hover:bg-surface-hover",
              )}
            >
              <span className="block text-[0.9375rem] font-medium">
                {label}
              </span>
              <span className="block text-[0.75rem] text-fg-tertiary">
                {hint}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
