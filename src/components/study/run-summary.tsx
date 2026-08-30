import { Flame, Target, Trophy } from "lucide-react";
import type { RunComparison } from "@/lib/deck-runs";

/**
 * HOW THAT RUN WENT — the last card of the deck.
 *
 * Three numbers and, when there is one, a comparison. Deliberately small:
 * the learner has just finished and is deciding whether to come back
 * tomorrow, and a dashboard is not what answers that. A score, a streak,
 * and whether they beat themselves is.
 *
 * The personal-best line only appears when there was something to beat.
 * Congratulating a first run for being the best one is the kind of empty
 * praise that makes the real one worth less when it finally arrives.
 */
export function RunSummaryCard({ result }: { result: RunComparison }) {
  const { run, bestAccuracy, bestStreak, totalRuns, isPersonalBest } = result;

  return (
    <div className="run-summary mt-5 rounded-xl bg-surface-hover px-4 py-4 text-left">
      <div className="grid grid-cols-3 gap-3">
        <Figure
          icon={<Target className="size-4" />}
          label="This run"
          value={run.accuracy === null ? "—" : `${run.accuracy}%`}
          detail={`${run.correct} of ${run.cards}`}
        />
        <Figure
          icon={<Flame className="size-4" />}
          label="Best streak"
          value={`${run.bestStreak}`}
          detail="in a row"
        />
        <Figure
          icon={<Trophy className="size-4" />}
          label="Your best"
          value={bestAccuracy === null ? "—" : `${bestAccuracy}%`}
          detail={
            totalRuns === 1
              ? "first run"
              : `over ${totalRuns} run${totalRuns === 1 ? "" : "s"}`
          }
        />
      </div>

      {isPersonalBest && (
        <p className="mt-3 flex items-center gap-2 text-[0.875rem] font-medium text-accent-text">
          <Trophy className="size-4" />
          Personal best — you beat {bestAccuracy}%.
        </p>
      )}

      {!isPersonalBest && bestStreak !== null && run.bestStreak > bestStreak && (
        <p className="mt-3 flex items-center gap-2 text-[0.875rem] font-medium text-accent-text">
          <Flame className="size-4" />
          Longest streak yet — {run.bestStreak} in a row.
        </p>
      )}
    </div>
  );
}

function Figure({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[0.75rem] text-fg-tertiary">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-[1.375rem] leading-none font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-[0.75rem] text-fg-tertiary">{detail}</p>
    </div>
  );
}
