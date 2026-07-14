import { format } from "date-fns";
import { toLocalDateValue } from "@/lib/datetime";
import { LinkButton } from "@/components/ui/link-button";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Week range label + Prev / This week / Next, shared by both calendars. */
export function WeekNav({
  baseHref,
  weekStart,
}: {
  baseHref: string;
  weekStart: Date;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <p className="text-[0.9375rem] font-medium">
        {format(weekStart, "MMM d")} –{" "}
        {format(new Date(weekStart.getTime() + 6 * DAY_MS), "MMM d, yyyy")}
      </p>
      <div className="flex items-center gap-1.5">
        <LinkButton
          size="sm"
          href={`${baseHref}?week=${toLocalDateValue(new Date(weekStart.getTime() - 7 * DAY_MS))}`}
        >
          ← Prev
        </LinkButton>
        <LinkButton size="sm" href={baseHref}>
          This week
        </LinkButton>
        <LinkButton
          size="sm"
          href={`${baseHref}?week=${toLocalDateValue(new Date(weekStart.getTime() + 7 * DAY_MS))}`}
        >
          Next →
        </LinkButton>
      </div>
    </div>
  );
}
