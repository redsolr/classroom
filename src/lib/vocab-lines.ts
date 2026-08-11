/**
 * The `VOCAB: term — meaning` line convention — the contract between
 * the tutor prompts (which ask the model to mark words this way), the
 * chat's one-tap add chips, and the offline extraction mock. One parser
 * so the three can never drift.
 */

const VOCAB_LINE = /^\s*VOCAB:\s*(.+?)\s*[—–-]\s*(.+)\s*$/;

export type VocabLine = { term: string; meaning: string };

/** Parse one line; null when it isn't a VOCAB suggestion line. */
export function parseVocabLine(line: string): VocabLine | null {
  const match = VOCAB_LINE.exec(line);
  if (!match) return null;
  return { term: match[1], meaning: match[2] };
}
