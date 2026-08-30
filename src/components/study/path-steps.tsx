import Link from "next/link";
import {
  BookOpen,
  Check,
  GraduationCap,
  MessageCircle,
  MessageSquareQuote,
  type LucideIcon,
} from "lucide-react";
import type { PathStepProgress } from "@/lib/study-progress";
import { cn } from "@/lib/utils";

/**
 * THE PATH, drawn as a spine.
 *
 * A numbered list with a rule running down the left, because the one
 * thing a learner has to read off this in a second is ORDER — and every
 * other way of showing an ordered curriculum (cards in a grid, a
 * horizontal stepper) loses that the moment there are more than four
 * steps or the window gets narrow.
 *
 * NOTHING IS LOCKED. Every step links out to the surface it is about,
 * completed or not, ahead of you or not. The founder's brief was "they
 * can jump around but we guide the foundation", and a greyed-out step
 * with a padlock is the opposite product: it says the app knows better
 * than the learner does about what they are ready for. What we do
 * instead is mark ONE step as the one we would do next, and let the
 * learner disagree.
 */

const STEP_ICON: Record<PathStepProgress["kind"], LucideIcon> = {
  pack: BookOpen,
  sentences: MessageSquareQuote,
  chat: MessageCircle,
  lesson: GraduationCap,
};

/** Where a step sends you — the surface that step is about, already
 * scoped. A step that lands you on a page you then have to navigate out
 * of is a description of work, not a way into it. */
function stepHref(step: PathStepProgress): string {
  switch (step.kind) {
    case "pack":
      return step.packSlug ? `/official/${step.packSlug}` : "/official";
    case "sentences":
      return "/sentences";
    case "chat":
      return "/chat";
    case "lesson":
      return "/tutors";
  }
}

function stepUnit(step: PathStepProgress): string {
  switch (step.kind) {
    case "pack":
      return "words known";
    case "sentences":
      return "cards known";
    case "chat":
      return "messages";
    case "lesson":
      return "lessons";
  }
}

export function PathSteps({
  steps,
  nextId,
}: {
  steps: PathStepProgress[];
  /** The step the path points at — the first INCOMPLETE one, which may
   * be behind a step the learner already jumped ahead and finished. */
  nextId?: string;
}) {
  return (
    <ol className="path-steps relative space-y-3">
      {steps.map((step, index) => {
        const Icon = STEP_ICON[step.kind];
        const isNext = step.id === nextId;
        return (
          <li key={step.id} className="path-step relative">
            <Link
              href={stepHref(step)}
              className={cn(
                "flex gap-4 rounded-xl bg-surface p-4 shadow-card transition-colors hover:bg-surface-hover",
                // The next step is the only one that gets emphasis. A
                // path where every row is loud has no next step.
                isNext && "ring-2 ring-accent",
              )}
            >
              <span
                className={cn(
                  "path-step-marker flex size-10 shrink-0 items-center justify-center rounded-full text-[0.9375rem] font-semibold",
                  step.complete
                    ? "bg-success-soft text-success"
                    : isNext
                      ? "bg-accent text-white"
                      : "bg-surface-hover text-fg-tertiary",
                )}
              >
                {step.complete ? (
                  <Check className="size-5" aria-label="Done" />
                ) : (
                  index + 1
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <Icon aria-hidden className="size-4 text-fg-tertiary" />
                  <span className="text-[1rem] font-semibold">
                    {step.title}
                  </span>
                  {isNext && (
                    <span className="rounded-full bg-accent-soft px-2 py-px text-[0.72rem] font-semibold tracking-wide text-accent-text uppercase">
                      Start here
                    </span>
                  )}
                </span>
                {step.detail && (
                  <span className="mt-1 block text-[0.9375rem] text-fg-secondary">
                    {step.detail}
                  </span>
                )}

                {/* The count is the honest sentence: what you have done,
                    over what this step asks for, in the step's own unit.
                    Never a percentage on its own — "60%" of a thing you
                    cannot name is not something anyone can act on. */}
                <span className="mt-2.5 flex items-center gap-3">
                  <span
                    className="path-step-bar h-1.5 w-full max-w-56 overflow-hidden rounded-full bg-surface-hover"
                    role="presentation"
                  >
                    <span
                      className={cn(
                        "block h-full rounded-full transition-[width]",
                        step.complete ? "bg-success" : "bg-accent",
                      )}
                      style={{ width: `${step.percent}%` }}
                    />
                  </span>
                  <span className="shrink-0 text-[0.8125rem] text-fg-tertiary tabular-nums">
                    {Math.min(step.done, step.target)} / {step.target}{" "}
                    {stepUnit(step)}
                  </span>
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
