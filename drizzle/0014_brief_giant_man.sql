CREATE TABLE "study_books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"author" text,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_id" uuid NOT NULL,
	"book_id" uuid,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "study_threads" ADD COLUMN "book_id" uuid;--> statement-breakpoint
ALTER TABLE "study_books" ADD CONSTRAINT "study_books_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_notes" ADD CONSTRAINT "study_notes_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_notes" ADD CONSTRAINT "study_notes_book_id_study_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."study_books"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "study_books_learner_id_idx" ON "study_books" USING btree ("learner_id");--> statement-breakpoint
CREATE INDEX "study_notes_learner_created_idx" ON "study_notes" USING btree ("learner_id","created_at");--> statement-breakpoint
CREATE INDEX "study_notes_book_id_idx" ON "study_notes" USING btree ("book_id");--> statement-breakpoint
ALTER TABLE "study_threads" ADD CONSTRAINT "study_threads_book_id_study_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."study_books"("id") ON DELETE set null ON UPDATE no action;