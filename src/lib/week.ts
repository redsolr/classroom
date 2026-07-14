import { startOfWeek } from "date-fns";

/**
 * Resolve a `?week=YYYY-MM-DD` param to that week's Monday; defaults to
 * the current week. Lives outside any component so render stays pure.
 */
export function resolveWeekStart(param?: string): Date {
  if (param) {
    const parsed = new Date(param);
    if (!Number.isNaN(parsed.getTime()))
      return startOfWeek(parsed, { weekStartsOn: 1 });
  }
  return startOfWeek(new Date(), { weekStartsOn: 1 });
}

/** Current instant as ISO, for passing "today" across the RSC boundary. */
export function nowIso(): string {
  return new Date().toISOString();
}
