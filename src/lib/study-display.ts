/**
 * Display rules shared by server pages and client sidebar components —
 * pure module, safe to import anywhere.
 */

/** One fallback-naming rule for chats everywhere they render. */
export function threadTitle(thread: {
  title: string | null;
  language: string | null;
}): string {
  return thread.title ?? `${thread.language ?? "New"} chat`;
}
