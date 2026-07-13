CREATE TYPE "public"."attendance_outcome" AS ENUM('attended', 'student_no_show', 'teacher_no_show', 'late_cancel');--> statement-breakpoint
ALTER TYPE "public"."lesson_status" ADD VALUE 'scheduled';--> statement-breakpoint
ALTER TYPE "public"."lesson_status" ADD VALUE 'cancelled';--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "attendance_outcome" "attendance_outcome";--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "rescheduled_from_lesson_id" uuid;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_rescheduled_from_lesson_id_lessons_id_fk" FOREIGN KEY ("rescheduled_from_lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;