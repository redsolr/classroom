/**
 * The single definition of "this lesson actually happened". Scheduled
 * plans and cancellations never count toward last-lesson recency,
 * trends, or lesson totals — every consumer filters through here.
 */
export const NOT_HAPPENED_STATUSES = ["scheduled", "cancelled"] as const;

export function isHappenedLesson(status: string): boolean {
  return !NOT_HAPPENED_STATUSES.includes(
    status as (typeof NOT_HAPPENED_STATUSES)[number],
  );
}
