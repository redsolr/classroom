/**
 * Cloze sentences — Anki's `{{…}}` convention, one blank per card.
 *
 * A word card asks what a word means. A cloze card asks whether you can
 * still supply it when the sentence needs it, which is a much harder and
 * much more honest test of "do I know this word".
 *
 * The marker is stored IN the text rather than as character offsets: it
 * survives editing by hand, it's what a model emits reliably, and it
 * can't drift out of sync with the string the way an offset pair can.
 */

const CLOZE = /\{\{(.+?)\}\}/s;

export type ParsedCloze = {
  before: string;
  /** The hidden span — the thing being tested. */
  answer: string;
  after: string;
};

/** Split a sentence at its blank. Returns null when the text carries no
 * `{{…}}` span at all, which callers treat as "not a valid card yet"
 * rather than guessing where the blank should have been. */
export function parseCloze(text: string): ParsedCloze | null {
  const match = CLOZE.exec(text);
  if (!match) return null;
  return {
    before: text.slice(0, match.index),
    answer: match[1],
    after: text.slice(match.index + match[0].length),
  };
}

/** The sentence as a human reads it, blank filled in — for lists, search
 * and anywhere the answer isn't the point. */
export function clozeToPlain(text: string): string {
  return text.replace(CLOZE, "$1");
}

/** True when the text carries exactly one blank. More than one would be
 * two cards wearing one row; zero is not a card at all. */
export function hasSingleCloze(text: string): boolean {
  const first = CLOZE.exec(text);
  if (!first) return false;
  return !CLOZE.test(text.slice(first.index + first[0].length));
}

/**
 * Wrap the first occurrence of `word` in the sentence so a plain
 * sentence becomes a card. Used when a model returns the sentence and
 * the target separately (the common case) — and returns null when the
 * word isn't actually in the sentence, so a mismatch fails loudly
 * instead of producing a card with no blank.
 */
export function markCloze(sentence: string, word: string): string | null {
  const at = sentence.indexOf(word);
  if (at === -1) return null;
  return (
    sentence.slice(0, at) +
    `{{${word}}}` +
    sentence.slice(at + word.length)
  );
}
