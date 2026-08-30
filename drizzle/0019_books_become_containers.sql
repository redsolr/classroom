-- Books become containers; vocab lists become decks.
--
-- HAND-WRITTEN, and every statement is a RENAME. drizzle-kit cannot
-- express this non-interactively (it prompts "created, or renamed from
-- another table?"), and letting it guess would have emitted DROP +
-- CREATE — the same end state as this migration except that it silently
-- destroys every word, every deck membership and every card's review
-- history.
--
-- The matching snapshot was produced by applying exactly these renames
-- as string substitutions to the previous one, so the ADDITIVE migration
-- that follows diffs against a truthful baseline instead of trying to
-- "fix" names it thinks are wrong.
--> statement-breakpoint
ALTER TABLE "study_vocab_lists" RENAME TO "study_decks";--> statement-breakpoint
ALTER TABLE "study_vocab_list_items" RENAME TO "study_deck_items";--> statement-breakpoint
ALTER TABLE "study_deck_items" RENAME COLUMN "list_id" TO "deck_id";--> statement-breakpoint
ALTER TABLE "study_sentences" RENAME COLUMN "list_id" TO "deck_id";--> statement-breakpoint
ALTER TABLE "study_decks" RENAME CONSTRAINT "study_vocab_lists_learner_id_learners_id_fk" TO "study_decks_learner_id_learners_id_fk";--> statement-breakpoint
ALTER TABLE "study_deck_items" RENAME CONSTRAINT "study_vocab_list_items_list_id_study_vocab_lists_id_fk" TO "study_deck_items_deck_id_study_decks_id_fk";--> statement-breakpoint
ALTER TABLE "study_deck_items" RENAME CONSTRAINT "study_vocab_list_items_vocab_id_study_vocab_id_fk" TO "study_deck_items_vocab_id_study_vocab_id_fk";--> statement-breakpoint
ALTER TABLE "study_sentences" RENAME CONSTRAINT "study_sentences_list_id_study_vocab_lists_id_fk" TO "study_sentences_deck_id_study_decks_id_fk";--> statement-breakpoint
ALTER INDEX "study_vocab_lists_learner_id_idx" RENAME TO "study_decks_learner_id_idx";--> statement-breakpoint
ALTER INDEX "study_vocab_lists_one_default_idx" RENAME TO "study_decks_one_default_idx";--> statement-breakpoint
ALTER INDEX "study_vocab_list_items_list_vocab_idx" RENAME TO "study_deck_items_deck_vocab_idx";--> statement-breakpoint
ALTER INDEX "study_vocab_list_items_list_position_idx" RENAME TO "study_deck_items_deck_position_idx";--> statement-breakpoint
ALTER INDEX "study_sentences_learner_list_idx" RENAME TO "study_sentences_learner_deck_idx";
