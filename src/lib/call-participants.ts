/**
 * THE PARTICIPANT ID CONTRACT.
 *
 * The id we hand the provider for a person, and the way back out of it.
 *
 * One place, because the format is a CONTRACT: it is written when a
 * participant joins and read back off the recording manifest to decide
 * whose voice a file is. Spelling it in two files is how the day comes
 * that one of them changes and a lesson's audio stops being attributable.
 *
 * It lives in its own module — pure, no database, no `server-only` — so
 * the ingest pipeline's manifest parser can read the contract without
 * pulling the whole call-guard module (and its connection) behind it.
 */

export type CallRole = "teacher" | "student";

export function callParticipantId(role: CallRole, id: string): string {
  return `${role}:${id}`;
}

/** The role encoded in a participant id, or null if it is not one of ours. */
export function roleFromParticipantId(value: string | null): CallRole | null {
  if (!value) return null;
  if (value.startsWith("teacher:")) return "teacher";
  if (value.startsWith("student:")) return "student";
  return null;
}
