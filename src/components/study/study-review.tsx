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
  { grade: "again", label: "Again", hint: "← forgot it" },
  { grade: "hard", label: "Hard", hint: "↓ barely" },
  { grade: "good", label: "Good", hint: "→ got it" },
  { grade: "easy", label: "Easy", hint: "↑ instant" },
];

/** Drag distance (px, dominant axis) that commits a grade on release. */
const SWIPE_THRESHOLD = 90;
/** Fly-off animation length — advance happens when it lands. */
const EXIT_MS = 280;

/** Tinder mapping: horizontal = the everyday pair, vertical = the extremes. */
const EXIT_VECTORS: Record<ReviewGrade, { dx: number; dy: number }> = {
  again: { dx: -560, dy: 0 },
  good: { dx: 560, dy: 0 },
  easy: { dx: 0, dy: -560 },
  hard: { dx: 0, dy: 560 },
};

function dominantGrade(dx: number, dy: number): ReviewGrade {
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "good" : "again";
  return dy < 0 ? "easy" : "hard";
}

function gradeLabel(grade: ReviewGrade): string {
  return GRADES.find((g) => g.grade === grade)?.label ?? grade;
}

/**
 * Flashcard session over the due deck — a Tinder-style card stack.
 *
 * Layout is FIXED for the whole session: the deck area, the grade bar,
 * and the progress line never move. Revealing fades the answer in
 * inside the card (no growth, no shifting chrome — the old build grew
 * the card and mounted the buttons below it, so everything jumped on
 * every reveal). Grading is a swipe (card follows the finger with
 * rotation, a grade badge fades in past the threshold, then the card
 * flies off while the next one scales up) or the four buttons, which
 * fire the same fly-off. Grades save optimistically — the deck never
 * waits on the network between cards.
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
  const [graded, setGraded] = React.useState(0);
  const [saveError, setSaveError] = React.useState(false);
  const [drag, setDrag] = React.useState<{ dx: number; dy: number } | null>(
    null,
  );
  const [exit, setExit] = React.useState<{
    grade: ReviewGrade;
    dx: number;
    dy: number;
  } | null>(null);
  const [, startTransition] = React.useTransition();

  const dragOrigin = React.useRef<{ x: number; y: number } | null>(null);
  const exitingRef = React.useRef(false);
  const exitTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    };
  }, []);

  const card = deck[index];
  const nextCard = deck[index + 1];

  const commit = (grade: ReviewGrade) => {
    if (!card || exitingRef.current) return;
    exitingRef.current = true;
    setDrag(null);
    setExit({ grade, ...EXIT_VECTORS[grade] });

    // Optimistic: the animation IS the pacing — a save failure surfaces
    // as a note under the deck instead of freezing the session.
    const cardId = card.id;
    startTransition(async () => {
      try {
        await reviewStudyVocab(cardId, grade);
      } catch (error) {
        console.error("study review: failed to save grade", error);
        setSaveError(true);
      }
    });

    exitTimerRef.current = setTimeout(() => {
      exitingRef.current = false;
      setExit(null);
      setRevealed(false);
      setGraded((n) => n + 1);
      setIndex((i) => i + 1);
    }, EXIT_MS);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!revealed || exitingRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragOrigin.current = { x: e.clientX, y: e.clientY };
    setDrag({ dx: 0, dy: 0 });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragOrigin.current) return;
    setDrag({
      dx: e.clientX - dragOrigin.current.x,
      dy: e.clientY - dragOrigin.current.y,
    });
  };

  const onPointerEnd = () => {
    if (!dragOrigin.current) return;
    dragOrigin.current = null;
    setDrag((d) => {
      if (d && Math.max(Math.abs(d.dx), Math.abs(d.dy)) >= SWIPE_THRESHOLD) {
        // commit() from inside an updater would double-fire in strict
        // mode — decide here, act in a microtask.
        queueMicrotask(() => commit(dominantGrade(d.dx, d.dy)));
        return d;
      }
      return null;
    });
  };

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
          <Link href="/chat" className="text-accent-text hover:underline">
            Back to chat
          </Link>
          <Link href="/vocab" className="text-accent-text hover:underline">
            My vocabulary
          </Link>
        </div>
      </div>
    );
  }

  // Badge = the grade the current gesture is heading toward.
  const badgeGrade =
    exit?.grade ??
    (drag && (Math.abs(drag.dx) > 12 || Math.abs(drag.dy) > 12)
      ? dominantGrade(drag.dx, drag.dy)
      : null);
  const badgeOpacity = exit
    ? 1
    : drag
      ? Math.min(1, Math.max(Math.abs(drag.dx), Math.abs(drag.dy)) / SWIPE_THRESHOLD)
      : 0;

  const cardStyle: React.CSSProperties = exit
    ? {
        transform: `translate(${exit.dx}px, ${exit.dy}px) rotate(${exit.dx * 0.08}deg)`,
        opacity: 0,
        transition: `transform ${EXIT_MS}ms ease-in, opacity ${EXIT_MS}ms ease-in`,
      }
    : drag
      ? {
          transform: `translate(${drag.dx}px, ${drag.dy}px) rotate(${drag.dx * 0.06}deg)`,
        }
      : { transform: "none", transition: "transform 200ms ease-out" };

  return (
    <div className="study-review select-none">
      <p className="review-progress mb-3 text-[0.875rem] text-fg-tertiary">
        Card {index + 1} of {deck.length} · {card.language}
      </p>

      <div className="review-deck relative h-[21rem] sm:h-[22rem]">
        {/* The next card peeking underneath — face down (no spoilers),
            it scales up as the top card flies off. */}
        {nextCard && (
          <div
            aria-hidden
            className={cn(
              "review-card-under absolute inset-0 rounded-xl bg-surface shadow-card transition-transform duration-200",
              exit ? "translate-y-0 scale-100" : "translate-y-2.5 scale-[0.94]",
            )}
          />
        )}

        <div
          className={cn(
            "review-card absolute inset-0 flex flex-col rounded-xl bg-surface px-6 py-6 text-center shadow-card",
            revealed && "cursor-grab touch-none active:cursor-grabbing",
          )}
          style={cardStyle}
          onClick={revealed ? undefined : () => setRevealed(true)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
          {badgeGrade && (
            <div
              className="review-swipe-badge pointer-events-none absolute top-4 left-1/2 z-10 -translate-x-1/2 -rotate-6"
              style={{ opacity: badgeOpacity }}
            >
              <span
                className={cn(
                  "rounded-md border-2 bg-surface px-3 py-1 text-[1rem] font-bold tracking-widest uppercase",
                  badgeGrade === "again"
                    ? "border-danger text-danger"
                    : "border-accent text-accent-text",
                )}
              >
                {gradeLabel(badgeGrade)}
              </span>
            </div>
          )}

          <div className="review-card-face flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto">
            <p className="text-[1.75rem] font-semibold tracking-tight">
              {card.term}
            </p>
            {card.reading && (
              <p className="mt-1 text-[1rem] text-fg-secondary">
                {card.reading}
              </p>
            )}
            {revealed && (
              <div className="review-answer animate-panel-in mt-5 w-full border-t border-border pt-4">
                <p className="text-[1.125rem]">{card.meaning ?? "—"}</p>
                {card.example && (
                  <p className="mt-2 text-[0.9375rem] text-fg-secondary italic">
                    {card.example}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Fixed-height slot — the button swaps for the swipe hint
              without moving anything. */}
          <div className="review-card-footer flex h-10 shrink-0 items-center justify-center">
            {revealed ? (
              <p className="text-[0.78rem] text-fg-tertiary">
                Swipe the card, or tap a grade below
              </p>
            ) : (
              <button
                type="button"
                onClick={() => setRevealed(true)}
                className="rounded-md border border-border-strong bg-surface px-4 py-2 text-[0.9375rem] font-medium transition-colors hover:bg-surface-hover"
              >
                Show answer
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Always mounted, enabled on reveal — the bar never jumps in. */}
      <div className="review-grades mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {GRADES.map(({ grade: g, label, hint }) => (
          <button
            key={g}
            type="button"
            disabled={!revealed || Boolean(exit)}
            onClick={() => commit(g)}
            className={cn(
              "rounded-md border px-3 py-2.5 text-center transition-colors disabled:opacity-40",
              g === "again"
                ? "border-border-strong bg-surface text-danger hover:bg-danger-soft"
                : "border-border-strong bg-surface hover:bg-surface-hover",
            )}
          >
            <span className="block text-[0.9375rem] font-medium">{label}</span>
            <span className="block text-[0.75rem] text-fg-tertiary">
              {hint}
            </span>
          </button>
        ))}
      </div>

      {saveError && (
        <p className="review-save-error mt-3 text-[0.875rem] text-danger">
          Some grades didn&rsquo;t save — they&rsquo;ll come back as due cards.
        </p>
      )}
    </div>
  );
}
