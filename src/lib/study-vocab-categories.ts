/**
 * Word-class roster for the personal vocabulary (filter chips, add/edit
 * selects, save-as-list flows). Pure constant — safe in client components.
 * Stored as plain text on study_vocab.category; null = uncategorized.
 */
export const STUDY_VOCAB_CATEGORIES = [
  "Verb",
  "Noun",
  "Adjective",
  "Adverb",
  "Phrase",
  "Expression",
  "Grammar",
  "Other",
] as const;

export type StudyVocabCategory = (typeof STUDY_VOCAB_CATEGORIES)[number];
