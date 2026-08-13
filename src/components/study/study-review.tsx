"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Minus, PartyPopper, RotateCcw, X, Zap } from "lucide-react";
import { loadStudyPracticeDeck, reviewStudyVocab } from "@/lib/actions/study";
import { coverHue } from "@/components/study/book-cover";
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

/**
 * Button row order mirrors the swipe axes left→right: ← / ↓ / ↑ / →.
 * "again" is SRS jargon (Anki's "show it again soon") — surfaced as
 * "Forgot", which is what it actually means.
 */
const GRADES: {
  grade: ReviewGrade;
  label: string;
  dir: string;
  icon: React.ComponentType<{ className?: string }>;
  circleClass: string;
  sizeClass: string;
  iconClass: string;
}[] = [
  {
    grade: "again",
    label: "Forgot",
    dir: "←",
    icon: X,
    circleClass:
      "border-2 border-danger bg-surface text-danger hover:bg-danger-soft",
    sizeClass: "size-14",
    iconClass: "size-6",
  },
  {
    grade: "hard",
    label: "Hard",
    dir: "↓",
    icon: Minus,
    circleClass:
      "border-2 border-border-strong bg-surface text-fg-secondary hover:bg-surface-hover",
    sizeClass: "size-12",
    iconClass: "size-5",
  },
  {
    grade: "easy",
    label: "Easy",
    dir: "↑",
    icon: Zap,
    circleClass:
      "border-2 border-accent bg-surface text-accent-text hover:bg-accent-soft",
    sizeClass: "size-12",
    iconClass: "size-5",
  },
  {
    grade: "good",
    label: "Good",
    dir: "→",
    icon: Check,
    circleClass: "bg-accent text-white shadow-sm hover:bg-accent-hover",
    sizeClass: "size-14",
    iconClass: "size-6",
  },
];

/** Drag distance (px, dominant axis) that commits a grade on release. */
const SWIPE_THRESHOLD = 90;
/** Under this, a release is a TAP — which flips the card. */
const TAP_SLOP = 8;
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

/** Full-bleed cover gradient, keyed by LANGUAGE (same tint app-wide,
 * matching the library's generated covers; theme-fixed like them). */
function coverGradient(language: string): string {
  const hue = coverHue(language);
  return `linear-gradient(160deg, hsl(${hue} 52% 42%) 0%, hsl(${(hue + 38) % 360} 55% 26%) 100%)`;
}

/**
 * One card's interior — shared by the top card AND the next card
 * peeking underneath, so promotion is seamless: when the top card flies
 * off, the under card already shows exactly what the new top card will
 * (same term, same divider, same footer), and nothing pops in.
 */
function CardFace({
  card,
  revealed,
  onReveal,
}: {
  card: ReviewCard;
  revealed: boolean;
  onReveal?: () => void;
}) {
  return (
    // The card containers carry the full-bleed cover gradient; this
    // face only lays out ON it. Two FIXED zones as ever: the term never
    // moves, and the answer fades in on a white sheet OVER the lower
    // cover — revealing changes zero geometry. Colors are hardcoded
    // light-on-tint / dark-on-white because the cover (like the
    // library's) keeps its own colors in both themes.
    <>
      <div className="review-card-front relative flex h-[45%] shrink-0 flex-col items-center justify-end gap-1 px-6 pb-6 text-white">
        <span className="review-language-chip absolute top-4 left-4 rounded-full bg-white/15 px-2.5 py-0.5 text-[0.75rem] font-medium">
          {card.language}
        </span>
        <p className="text-[2rem] font-semibold tracking-tight">{card.term}</p>
        {card.reading && (
          <p className="text-[1rem] text-white/75">{card.reading}</p>
        )}
      </div>
      <div className="review-answer-zone min-h-0 flex-1 px-5 pt-1">
        {revealed && (
          <div className="review-answer animate-panel-in rounded-xl bg-white/95 px-4 py-4 text-neutral-900 shadow-sm">
            <p className="text-[1.125rem]">{card.meaning ?? "—"}</p>
            {card.example && (
              <p className="mt-2 line-clamp-3 text-[0.9375rem] text-neutral-600 italic">
                {card.example}
              </p>
            )}
          </div>
        )}
      </div>
      {/* Fixed-height slot — the button swaps for the swipe hint
          without moving anything. */}
      <div className="review-card-footer mb-5 flex h-10 shrink-0 items-center justify-center px-6">
        {revealed ? (
          <p className="text-[0.78rem] text-white/75">
            Swipe the card, or tap a grade below
          </p>
        ) : (
          <button
            type="button"
            onClick={onReveal}
            className="rounded-md border border-white/30 bg-white/15 px-4 py-2 text-[0.9375rem] font-medium text-white transition-colors hover:bg-white/25"
          >
            Show answer
          </button>
        )}
      </div>
    </>
  );
}

/**
 * Flashcard session over the due deck — a Tinder-style card stack.
 *
 * Layout is FIXED for the whole session: the deck area, the grade row,
 * and the progress line never move; revealing fades the answer into
 * reserved space inside the card. Swiping works the WHOLE card, any
 * time — before reveal too (know it? just swipe); a sub-slop release is
 * a tap and flips the card instead. Grades commit on swipe (drag-follow
 * + rotation + threshold badge + fly-off) or via the Tinder-style
 * circular buttons, which fire the same fly-off. Saves are optimistic —
 * the deck never waits on the network between cards.
 *
 * The deck is snapshotted INTO STATE on mount: grading triggers a
 * revalidation, and any revalidatePath in a server action makes Next
 * re-render the current page and push a fresh (shrunken) deck prop —
 * consuming the prop directly strands the session mid-deck (learned
 * from e2e: "Card 1 of 2" → completion after one card).
 */
export function StudyReview({
  deck: initialDeck,
  totalWords,
}: {
  deck: ReviewCard[];
  /** Dictionary size — a practice round is offered whenever it's > 0. */
  totalWords: number;
}) {
  const [deck, setDeck] = React.useState(initialDeck);
  /** "due" grades for real (SM-2); "practice" is an Anki-style cram
   * round — same swipes, NEVER touches the schedule. */
  const [mode, setMode] = React.useState<"due" | "practice">("due");
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

  const [loadingPractice, startPractice] = React.useTransition();

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
    // Practice rounds never persist (cram must not reschedule).
    if (mode === "due") {
      const cardId = card.id;
      startTransition(async () => {
        try {
          await reviewStudyVocab(cardId, grade);
        } catch (error) {
          console.error("study review: failed to save grade", error);
          setSaveError(true);
        }
      });
    }

    exitTimerRef.current = setTimeout(() => {
      exitingRef.current = false;
      setExit(null);
      setRevealed(false);
      setGraded((n) => n + 1);
      setIndex((i) => i + 1);
    }, EXIT_MS);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (exitingRef.current) return;
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
      // commit()/setRevealed() from inside an updater would double-fire
      // in strict mode — decide here, act in a microtask.
      if (d) {
        const dist = Math.max(Math.abs(d.dx), Math.abs(d.dy));
        if (dist >= SWIPE_THRESHOLD) {
          queueMicrotask(() => commit(dominantGrade(d.dx, d.dy)));
          return d;
        }
        if (dist < TAP_SLOP) {
          // A tap flips the card (pointer capture retargets the click,
          // so the Show-answer button's own onClick may never fire).
          queueMicrotask(() => setRevealed(true));
        }
      }
      return null;
    });
  };

  const practiceAgain = () => {
    startPractice(async () => {
      try {
        const cards = await loadStudyPracticeDeck();
        if (cards.length === 0) return;
        setMode("practice");
        setDeck(cards);
        setIndex(0);
        setGraded(0);
        setRevealed(false);
        setSaveError(false);
      } catch (error) {
        console.error("study review: failed to load practice deck", error);
      }
    });
  };

  if (!card) {
    return (
      <div className="rounded-lg bg-surface px-6 py-10 text-center shadow-card">
        <PartyPopper className="mx-auto mb-3 size-6 text-accent" />
        <h2 className="text-[1.125rem] font-semibold">
          {graded > 0
            ? `Nice — ${graded} card${graded === 1 ? "" : "s"} ${mode === "practice" ? "practiced" : "reviewed"}.`
            : "Nothing due right now."}
        </h2>
        <p className="mt-1 text-[0.9375rem] text-fg-secondary">
          {totalWords > 0
            ? "Deal the deck again any time — practice rounds don't change your schedule."
            : "Add new words as you chat and they'll show up here."}
        </p>
        {totalWords > 0 && (
          <button
            type="button"
            onClick={practiceAgain}
            disabled={loadingPractice}
            className="mx-auto mt-5 flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-[0.9375rem] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            <RotateCcw className="size-4" />
            {graded > 0 ? "Practice again" : "Practice anyway"}
          </button>
        )}
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
      ? Math.min(
          1,
          Math.max(Math.abs(drag.dx), Math.abs(drag.dy)) / SWIPE_THRESHOLD,
        )
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
      : {
          // A real identity transform (not "none"): the card must ALWAYS
          // be a stacking context so its ::after elevation shadow layers
          // directly behind it instead of dropping under the stack.
          transform: "translate(0px, 0px)",
          transition: "transform 200ms ease-out",
        };

  return (
    // Narrow portrait column — the deck must read as a CARD STACK, not
    // a full-width panel.
    <div className="study-review mx-auto max-w-sm select-none">
      {/* Language moved onto the card's cover chip. */}
      <p className="review-progress mb-3 text-center text-[0.875rem] text-fg-tertiary">
        Card {index + 1} of {deck.length}
        {mode === "practice" && (
          <span className="review-practice-note">
            {" "}
            · practice — doesn&rsquo;t change your schedule
          </span>
        )}
      </p>

      <div className="review-deck relative h-[24rem] sm:h-[26rem]">
        {deck[index + 2] && (
          <div
            key={deck[index + 2].id}
            aria-hidden
            className="review-card-under-2 absolute inset-0 translate-y-4 rotate-3 scale-[0.92] rounded-2xl border border-border bg-surface shadow-card"
            style={{ background: coverGradient(deck[index + 2].language) }}
          />
        )}
        {/* The next card underneath shows its REAL question face (term
            side only — no answer spoiler), so when it's promoted the
            content is already there; it straightens as the top card
            flies off. */}
        {nextCard && (
          <div
            key={nextCard.id}
            aria-hidden
            className={cn(
              "review-card-under pointer-events-none absolute inset-0 flex flex-col rounded-2xl border border-border bg-surface text-center shadow-card transition-transform duration-200",
              exit
                ? "translate-y-0 rotate-0 scale-100"
                : "translate-y-2.5 -rotate-2 scale-[0.95]",
            )}
            style={{ background: coverGradient(nextCard.language) }}
          >
            <CardFace card={nextCard} revealed={false} />
          </div>
        )}

        {/* touch-none ALWAYS, and no inner scroll container: a nested
            overflow-y-auto hands touch gestures to the scroller and
            cancels the drag's pointer events — on phones the card was
            only swipeable on its padding edges.

            KEYED by card id so each card mounts as a fresh node (an
            unkeyed node kept the exit transform and glided back with
            the next card's content). The base shadow matches the
            under card; the elevation fades in via .review-card::after
            (globals.css) so promotion doesn't pop. */}
        <div
          key={card.id}
          className={cn(
            "review-card absolute inset-0 flex cursor-grab touch-none flex-col rounded-2xl border border-border bg-surface text-center shadow-card active:cursor-grabbing",
          )}
          style={{ ...cardStyle, background: coverGradient(card.language) }}
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

          <CardFace
            card={card}
            revealed={revealed}
            onReveal={() => setRevealed(true)}
          />
        </div>
      </div>

      {/* Tinder-style circular grades, ordered by swipe axis ← ↓ ↑ →.
          Always enabled — swiping doesn't require revealing either. */}
      <div className="review-grades mt-5 flex items-start justify-center gap-4">
        {GRADES.map(({ grade: g, label, dir, icon: Icon, circleClass, sizeClass, iconClass }) => (
          <div key={g} className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              aria-label={label}
              disabled={Boolean(exit)}
              onClick={() => commit(g)}
              className={cn(
                "flex items-center justify-center rounded-full transition-colors disabled:opacity-40",
                sizeClass,
                circleClass,
              )}
            >
              <Icon className={iconClass} />
            </button>
            <span className="text-[0.72rem] text-fg-tertiary">
              {dir} {label}
            </span>
          </div>
        ))}
      </div>

      {saveError && (
        <p className="review-save-error mt-3 text-center text-[0.875rem] text-danger">
          Some grades didn&rsquo;t save — they&rsquo;ll come back as due cards.
        </p>
      )}
    </div>
  );
}
