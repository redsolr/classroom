CREATE TABLE "study_sentences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_id" uuid NOT NULL,
	"language" text NOT NULL,
	"text" text NOT NULL,
	"translation" text,
	"note" text,
	"vocab_id" uuid,
	"list_id" uuid,
	"status" "vocabulary_status" DEFAULT 'new' NOT NULL,
	"srs_reps" integer DEFAULT 0 NOT NULL,
	"srs_ease_factor" real DEFAULT 2.5 NOT NULL,
	"srs_interval_days" real DEFAULT 0 NOT NULL,
	"srs_due_at" timestamp with time zone,
	"last_reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "study_sentences" ADD CONSTRAINT "study_sentences_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sentences" ADD CONSTRAINT "study_sentences_vocab_id_study_vocab_id_fk" FOREIGN KEY ("vocab_id") REFERENCES "public"."study_vocab"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sentences" ADD CONSTRAINT "study_sentences_list_id_study_vocab_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."study_vocab_lists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "study_sentences_learner_due_idx" ON "study_sentences" USING btree ("learner_id","srs_due_at");--> statement-breakpoint
CREATE INDEX "study_sentences_learner_list_idx" ON "study_sentences" USING btree ("learner_id","list_id");