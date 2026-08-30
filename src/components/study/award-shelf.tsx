import { Award as AwardIcon } from "lucide-react";
import { TIER_CLASS, type Award } from "@/lib/study-grading";
import { Card, CardHeader } from "@/components/ui/page-header";

/**
 * REWARDS, each one showing its receipt.
 *
 * Every badge says what earned it in the learner's own numbers — "38
 * cards you've recalled on a later day", not "Vocabulary Master". That
 * is the whole difference between a reward and a sticker: a learner who
 * can trace a badge to something they did will believe the next one, and
 * a learner who cannot will stop reading them within a week.
 *
 * There is no locked/greyed-out row for badges not yet earned. A list of
 * things you have failed to do is not a reward shelf, and the ones you
 * have are supposed to be the point.
 */
export function AwardShelf({ awards }: { awards: Award[] }) {
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <AwardIcon className="size-4 text-fg-tertiary" />
            What you&rsquo;ve earned
          </span>
        }
      />
      <ul className="award-shelf grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-2">
        {awards.map((award) => (
          <li key={award.key} className="flex items-center gap-3">
            <span
              className={`flex size-10 shrink-0 items-center justify-center rounded-full ${TIER_CLASS[award.tier]}`}
            >
              <AwardIcon className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-[0.9375rem] font-semibold">
                {award.label}
              </span>
              {/* The receipt. Without it this is a sticker. */}
              <span className="block text-[0.8125rem] text-fg-tertiary">
                {award.earned}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
