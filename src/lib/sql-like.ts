/**
 * LIKE/ILIKE pattern escaping.
 *
 * Wildcards typed by a person must match literally — someone searching
 * "100%" is not writing a pattern, and someone searching "_" means an
 * underscore. Lives on its own because both the search page and the
 * tutor's note-search tool need it, and two copies of an escaping rule
 * is one copy too many.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}
