import type { StudyDeckRun } from "@/db";
import { Card, CardHeader } from "@/components/ui/page-header";

/**
 * PAST RUNS OVER THIS DECK — the record board.
 *
 * Only shown once there is something to show. A records panel reading
 * "no runs yet" on a deck you have never drilled is a box telling you
 * off for not having done something, which is the opposite of what a
 * scoreboard is for.
 *
 * Accuracy is computed from the stored counts rather than stored as a
 * percentage: a run's meaning is "18 of 20", and a percentage is one
 * rendering of that. Storing the rendering is how you end up unable to
 * answer "out of how many".
 */

function accuracy(run: StudyDeckRun): number {
  return run.cards === 0 ? 0 : Math.round((run.correct / run.cards) * 100);
}

function when(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
  }).format(date);
}

export function DeckRecords({ runs }: { runs: StudyDeckRun[] }) {
  if (runs.length === 0) return null;

  const best = Math.max(...runs.map(accuracy));
  const bestStreak = Math.max(...runs.map((r) => r.bestStreak));

  return (
    <Card className="deck-records">
      <CardHeader
        title="Your runs"
        actions={
          <span className="text-[0.8125rem] text-fg-tertiary">
            best {best}% · longest streak {bestStreak}
          </span>
        }
      />
      <ul className="divide-y divide-border">
        {runs.map((run) => {
          const pct = accuracy(run);
          return (
            <li
              key={run.id}
              className="flex items-center gap-3 px-4 py-2.5 text-[0.875rem]"
            >
              <span className="w-14 shrink-0 text-fg-tertiary">
                {when(run.finishedAt)}
              </span>
              <span className="min-w-0 flex-1">
                {run.correct} of {run.cards}
                {run.bestStreak > 1 && (
                  <span className="text-fg-tertiary">
                    {" "}
                    · {run.bestStreak} in a row
                  </span>
                )}
              </span>
              <span
                className={
                  pct === best
                    ? "shrink-0 font-semibold tabular-nums"
                    : "shrink-0 tabular-nums text-fg-secondary"
                }
              >
                {pct}%
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
