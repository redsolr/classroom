CREATE TYPE "public"."study_card_kind" AS ENUM('word', 'sentence');--> statement-breakpoint
CREATE TABLE "study_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_id" uuid NOT NULL,
	"kind" "study_card_kind" NOT NULL,
	"vocab_id" uuid,
	"sentence_id" uuid,
	"grade" "review_grade" NOT NULL,
	"interval_days" real NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "study_reviews" ADD CONSTRAINT "study_reviews_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_reviews" ADD CONSTRAINT "study_reviews_vocab_id_study_vocab_id_fk" FOREIGN KEY ("vocab_id") REFERENCES "public"."study_vocab"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_reviews" ADD CONSTRAINT "study_reviews_sentence_id_study_sentences_id_fk" FOREIGN KEY ("sentence_id") REFERENCES "public"."study_sentences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "study_reviews_learner_time_idx" ON "study_reviews" USING btree ("learner_id","reviewed_at");