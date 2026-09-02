import type { AccountabilityWindow } from "@/lib/accountability";

/**
 * THE NUDGE the accountability card hands to the composer.
 *
 * A pure function, kept out of the page so the wording is testable and
 * so there is exactly one place the phrasing lives.
 *
 * Two rules it must never break, both inherited from the card it reads:
 *
 *   1. OBSERVATIONS, never verdicts. "Studied on 3 of the last 14 days"
 *      is a fact two people can talk about; "not committed" is a label
 *      the learner would be right to resent, and the tutor would have to
 *      spend the lesson climbing back down from.
 *   2. It is a DRAFT. This text lands in the composer with the caret at
 *      the end of it, and a person sends it or rewrites it. The app does
 *      not write to a learner in their tutor's name.
 *
 * Only true clauses appear. A learner who studied eleven of fourteen
 * days gets a short message about the words they keep missing, not a
 * paragraph of manufactured concern — a nudge that arrives when nothing
 * is wrong is how a person learns to ignore the next one.
 */
export function draftNudge(
  window: AccountabilityWindow,
  studentName: string,
): string {
  const firstName = studentName.trim().split(/\s+/)[0] || studentName;
  const clauses: string[] = [];

  if (window.reviews === 0) {
    clauses.push(
      `I can't see any review in the last ${window.windowDays} days`,
    );
  } else {
    clauses.push(
      `you've studied on ${window.activeDays} of the last ${window.windowDays} days`,
    );
    if (window.daysSinceLastStudy !== null && window.daysSinceLastStudy >= 3) {
      clauses.push(`the last one was ${window.daysSinceLastStudy} days ago`);
    }
  }

  if (window.neverReviewed > 0) {
    clauses.push(
      `${window.neverReviewed} ${window.neverReviewed === 1 ? "word is" : "words are"} saved but haven't come up for review once`,
    );
  }

  if (window.retentionPercent !== null && window.retentionPercent < 70) {
    clauses.push(`recall is sitting at ${window.retentionPercent}%`);
  }

  const observation = joinClauses(clauses);
  const close =
    window.struggling.length > 0
      ? "Shall we start the next lesson on the ones below?"
      : "Anything getting in the way this week?";

  return `Hi ${firstName} — I had a look before our next lesson: ${observation}. ${close}`;
}

/** "a", "a and b", "a, b and c" — an Oxford-comma-free serial join. */
function joinClauses(clauses: string[]): string {
  if (clauses.length <= 1) return clauses[0] ?? "";
  return `${clauses.slice(0, -1).join(", ")} and ${clauses[clauses.length - 1]}`;
}
