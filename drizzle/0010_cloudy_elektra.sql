CREATE TABLE "study_pack_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pack_id" uuid NOT NULL,
	"term" text NOT NULL,
	"reading" text,
	"meaning" text,
	"example" text,
	"category" text,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"language" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vocabulary_books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vocabulary_items" ADD COLUMN "book_id" uuid;--> statement-breakpoint
ALTER TABLE "study_pack_items" ADD CONSTRAINT "study_pack_items_pack_id_study_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."study_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_books" ADD CONSTRAINT "vocabulary_books_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_books" ADD CONSTRAINT "vocabulary_books_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "study_pack_items_pack_term_idx" ON "study_pack_items" USING btree ("pack_id","term");--> statement-breakpoint
CREATE INDEX "study_pack_items_pack_position_idx" ON "study_pack_items" USING btree ("pack_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "study_packs_slug_idx" ON "study_packs" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "vocabulary_books_student_id_idx" ON "vocabulary_books" USING btree ("student_id");--> statement-breakpoint
ALTER TABLE "vocabulary_items" ADD CONSTRAINT "vocabulary_items_book_id_vocabulary_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."vocabulary_books"("id") ON DELETE set null ON UPDATE no action;