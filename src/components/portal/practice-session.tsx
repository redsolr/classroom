"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, PartyPopper } from "lucide-react";
import { reviewVocabularyViaPortal } from "@/lib/actions/portal";
import type { ReviewGrade } from "@/lib/srs";
import { Button } from "@/components/ui/button";

export type PracticeCard = {
  id: string;
  term: string;
  meaning: string | null;
  translation: string | null;
  example: string | null;
};

const grades: { grade: ReviewGrade; label: string; variant: "danger" | "secondary" | "primary" }[] = [
  { grade: "again", label: "Again", variant: "danger" },
  { grade: "hard", label: "Hard", variant: "secondary" },
  { grade: "good", label: "Good", variant: "primary" },
  { grade: "easy", label: "Easy", variant: "secondary" },
];

export function PracticeSession({
  token,
  cards,
}: {
  token: string;
  cards: PracticeCard[];
}) {
  const [index, setIndex] = React.useState(0);
  const [revealed, setRevealed] = React.useState(false);
  const [reviewed, setReviewed] = React.useState(0);

  const card = cards[index];

  function grade(g: ReviewGrade) {
    if (!card) return;
    // Fire-and-advance: scheduling happens server-side; a failed call is
    // logged and the card simply stays due for the next session.
    reviewVocabularyViaPortal(token, card.id, g).catch((error) => {
      console.error("reviewVocabularyViaPortal failed", error);
    });
    setReviewed((n) => n + 1);
    setRevealed(false);
    setIndex((i) => i + 1);
  }

  if (!card) {
    return (
      <div className="rounded-lg bg-surface px-6 py-10 text-center shadow-card">
        <PartyPopper className="mx-auto size-6 text-accent" />
        <p className="mt-3 text-[1.0625rem] font-semibold">
          {reviewed > 0
            ? `You reviewed ${reviewed} card${reviewed === 1 ? "" : "s"} 🎉`
            : "All caught up — nothing due right now."}
        </p>
        <p className="mt-1 text-[0.9375rem] text-fg-secondary">
          Come back tomorrow to keep your streak of memory going.
        </p>
        <Link
          href={`/p/${token}`}
          className="mt-4 inline-flex items-center gap-1.5 text-[0.9375rem] text-accent-text hover:underline"
        >
          <ArrowLeft className="size-3.5" />
          Back to your classroom
        </Link>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2 text-[0.8125rem] text-fg-tertiary">
        Card {index + 1} of {cards.length}
      </p>
      <div className="rounded-lg bg-surface px-6 py-10 text-center shadow-card">
        <p className="text-[1.375rem] font-semibold tracking-tight">
          {card.term}
        </p>
        {revealed ? (
          <div className="mt-4 space-y-1.5">
            {(card.meaning || card.translation) && (
              <p className="text-[1rem] text-fg-secondary">
                {[card.meaning, card.translation].filter(Boolean).join(" · ")}
              </p>
            )}
            {card.example && (
              <p className="text-[0.9375rem] italic text-fg-tertiary">
                “{card.example}”
              </p>
            )}
            {!card.meaning && !card.translation && !card.example && (
              <p className="text-[0.9375rem] text-fg-tertiary">
                No notes for this word — how well do you remember it?
              </p>
            )}
          </div>
        ) : (
          <p className="mt-4 text-[0.9375rem] text-fg-tertiary">
            Can you remember what it means?
          </p>
        )}
      </div>

      <div className="mt-4 flex justify-center gap-2">
        {revealed ? (
          grades.map((g) => (
            <Button
              key={g.grade}
              variant={g.variant}
              onClick={() => grade(g.grade)}
            >
              {g.label}
            </Button>
          ))
        ) : (
          <Button variant="primary" onClick={() => setRevealed(true)}>
            Show answer
          </Button>
        )}
      </div>
    </div>
  );
}
