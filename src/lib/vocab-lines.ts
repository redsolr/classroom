import { STUDY_LANGUAGES } from "@/lib/study-languages";

/**
 * The `VOCAB: term — meaning[ — Language]` line convention — the
 * contract between the tutor prompt (which asks the model to mark words
 * this way), the chat's one-tap add chips, and the offline extraction
 * mock. One parser so the three can never drift.
 *
 * The language segment is what lets chips file a word from ANY chat —
 * the word carries its own language instead of inheriting a project
 * "mode" (2026-08-14 generic-projects refactor). It must name a roster
 * language; an unrecognized tail folds back into the meaning.
 */

const VOCAB_LINE = /^\s*VOCAB:\s*(.+?)\s*[—–-]\s*(.+?)(?:\s*[—–-]\s*([^—–-]+?))?\s*$/;

export type VocabLine = { term: string; meaning: string; language: string | null };

/** Parse one line; null when it isn't a VOCAB suggestion line. */
export function parseVocabLine(line: string): VocabLine | null {
  const match = VOCAB_LINE.exec(line);
  if (!match) return null;
  const [, term, meaning, tail] = match;
  if (tail) {
    const language = STUDY_LANGUAGES.find(
      (l) => l.toLowerCase() === tail.trim().toLowerCase(),
    );
    if (language) return { term, meaning, language };
    // Not a language — the dash was part of the meaning itself.
    return { term, meaning: `${meaning} — ${tail}`, language: null };
  }
  return { term, meaning, language: null };
}
