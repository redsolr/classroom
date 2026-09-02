/**
 * WHAT ONE SIDE OF A CALL SENDS THE OTHER WHEN SOMEBODY TYPES.
 *
 * The message is written to the database first — that row is the record,
 * and `/messages` shows it tomorrow. This is only the LIVE half: a
 * broadcast over the meeting the two people are already in, so the line
 * appears in under a second instead of on the next page load. The thread
 * itself is unchanged; the call is a second window onto it, not a second
 * inbox.
 *
 * It carries OUR row id, not the provider's message id, so the same line
 * arriving twice — once over the wire, once from a later server fetch —
 * is recognisably one line.
 *
 * WHAT IT DELIBERATELY DOES NOT CARRY: who wrote it. A payload is typed
 * by the other participant's browser, so an `author` field in it would be
 * a claim that browser gets to make; there are exactly two people in the
 * room, so "it arrived" already means "they sent it". The durable record
 * takes its author from the server's own view of who is calling. Nothing
 * rendered from this wire can put words in the other person's mouth.
 */

/** Bumped only if the shape changes; an older peer ignores what it cannot read. */
const VERSION = 1;

export type CallChatWire = {
  /** Our `messages.id`, the join key on both sides. */
  id: string;
  body: string;
  /** ISO 8601, from the row the server wrote. */
  createdAt: string;
};

export function encodeCallChat(message: CallChatWire): string {
  return JSON.stringify({ v: VERSION, ...message });
}

/**
 * Read a broadcast, or null.
 *
 * Null for anything unrecognisable rather than a throw: this arrives off
 * a shared meeting channel, and a payload from another feature — or a
 * future version of this one — is a normal thing to receive and ignore,
 * not an error that should take down the chat pane.
 */
export function decodeCallChat(raw: string | undefined | null): CallChatWire | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const value = parsed as Record<string, unknown>;
  if (value.v !== VERSION) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.body !== "string" ||
    typeof value.createdAt !== "string" ||
    value.body.length === 0
  ) {
    return null;
  }
  // A timestamp we cannot read would render as "Invalid Date" in the
  // pane, which looks like our bug rather than their bad payload.
  if (Number.isNaN(new Date(value.createdAt).getTime())) return null;

  return { id: value.id, body: value.body, createdAt: value.createdAt };
}
