CREATE TYPE "public"."review_grade" AS ENUM('again', 'hard', 'good', 'easy');--> statement-breakpoint
CREATE TABLE "vocabulary_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"vocabulary_item_id" uuid NOT NULL,
	"grade" "review_grade" NOT NULL,
	"interval_days" real NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vocabulary_items" ADD COLUMN "srs_reps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "vocabulary_items" ADD COLUMN "srs_ease_factor" real DEFAULT 2.5 NOT NULL;--> statement-breakpoint
ALTER TABLE "vocabulary_items" ADD COLUMN "srs_interval_days" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "vocabulary_items" ADD COLUMN "srs_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vocabulary_items" ADD COLUMN "last_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vocabulary_reviews" ADD CONSTRAINT "vocabulary_reviews_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_reviews" ADD CONSTRAINT "vocabulary_reviews_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_reviews" ADD CONSTRAINT "vocabulary_reviews_vocabulary_item_id_vocabulary_items_id_fk" FOREIGN KEY ("vocabulary_item_id") REFERENCES "public"."vocabulary_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vocabulary_reviews_student_id_idx" ON "vocabulary_reviews" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "vocabulary_reviews_item_id_idx" ON "vocabulary_reviews" USING btree ("vocabulary_item_id");