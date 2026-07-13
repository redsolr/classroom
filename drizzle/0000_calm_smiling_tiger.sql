CREATE TYPE "public"."correction_category" AS ENUM('grammar', 'vocabulary', 'pronunciation', 'wordChoice', 'naturalExpression', 'spelling', 'other');--> statement-breakpoint
CREATE TYPE "public"."goal_priority" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."goal_status" AS ENUM('active', 'completed', 'paused');--> statement-breakpoint
CREATE TYPE "public"."homework_status" AS ENUM('assigned', 'submitted', 'reviewed', 'completed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."insight_type" AS ENUM('recurringMistake', 'learningPreference', 'interest', 'strength', 'weakness', 'teachingStrategy', 'generalObservation');--> statement-breakpoint
CREATE TYPE "public"."lesson_source_type" AS ENUM('manual', 'notes', 'chat', 'transcript', 'audio');--> statement-breakpoint
CREATE TYPE "public"."lesson_status" AS ENUM('draft', 'processed', 'reviewed', 'shared');--> statement-breakpoint
CREATE TYPE "public"."student_status" AS ENUM('active', 'trial', 'paused', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."vocabulary_status" AS ENUM('new', 'learning', 'reviewing', 'mastered');--> statement-breakpoint
CREATE TABLE "corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"lesson_id" uuid,
	"category" "correction_category" DEFAULT 'grammar' NOT NULL,
	"original_text" text NOT NULL,
	"corrected_text" text NOT NULL,
	"explanation" text,
	"teacher_approved" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "goal_status" DEFAULT 'active' NOT NULL,
	"priority" "goal_priority" DEFAULT 'medium' NOT NULL,
	"target_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "homework" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"lesson_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"due_at" timestamp with time zone,
	"status" "homework_status" DEFAULT 'assigned' NOT NULL,
	"teacher_feedback" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"type" "insight_type" DEFAULT 'generalObservation' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"source_lesson_id" uuid,
	"confidence" real,
	"teacher_approved" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"title" text,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_minutes" integer,
	"status" "lesson_status" DEFAULT 'draft' NOT NULL,
	"source_type" "lesson_source_type" DEFAULT 'notes' NOT NULL,
	"raw_input" text,
	"teacher_private_notes" text,
	"summary" text,
	"student_visible_summary" text,
	"next_lesson_focus" text,
	"ai_draft" jsonb,
	"ai_processed_at" timestamp with time zone,
	"recap_token" text,
	"recap_message" text,
	"recap_shared_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"avatar_color" text,
	"native_language" text,
	"target_language" text NOT NULL,
	"current_level" text,
	"target_level" text,
	"status" "student_status" DEFAULT 'active' NOT NULL,
	"timezone" text,
	"platform" text,
	"lesson_frequency" text,
	"general_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teachers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workos_user_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"timezone" text,
	"native_language" text,
	"languages_taught" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vocabulary_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"lesson_id" uuid,
	"term" text NOT NULL,
	"meaning" text,
	"translation" text,
	"example" text,
	"language" text,
	"status" "vocabulary_status" DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework" ADD CONSTRAINT "homework_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework" ADD CONSTRAINT "homework_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework" ADD CONSTRAINT "homework_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_source_lesson_id_lessons_id_fk" FOREIGN KEY ("source_lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_topics" ADD CONSTRAINT "lesson_topics_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_topics" ADD CONSTRAINT "lesson_topics_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_items" ADD CONSTRAINT "vocabulary_items_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_items" ADD CONSTRAINT "vocabulary_items_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_items" ADD CONSTRAINT "vocabulary_items_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "corrections_student_id_idx" ON "corrections" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "corrections_lesson_id_idx" ON "corrections" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "goals_student_id_idx" ON "goals" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "homework_student_id_idx" ON "homework" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "homework_lesson_id_idx" ON "homework" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "insights_student_id_idx" ON "insights" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "lesson_topics_lesson_id_idx" ON "lesson_topics" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "lessons_teacher_id_idx" ON "lessons" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "lessons_student_id_idx" ON "lessons" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lessons_recap_token_idx" ON "lessons" USING btree ("recap_token");--> statement-breakpoint
CREATE INDEX "students_teacher_id_idx" ON "students" USING btree ("teacher_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teachers_workos_user_id_idx" ON "teachers" USING btree ("workos_user_id");--> statement-breakpoint
CREATE INDEX "vocabulary_items_student_id_idx" ON "vocabulary_items" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "vocabulary_items_lesson_id_idx" ON "vocabulary_items" USING btree ("lesson_id");