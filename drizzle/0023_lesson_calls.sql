CREATE TYPE "public"."lesson_call_role" AS ENUM('teacher', 'student');--> statement-breakpoint
CREATE TYPE "public"."lesson_recording_state" AS ENUM('awaiting_consent', 'recording', 'recording_complete', 'ingesting', 'ingested', 'transcription_queued', 'transcribing', 'transcribed', 'extracting', 'awaiting_teacher_review', 'completed', 'failed', 'deleted');--> statement-breakpoint
CREATE TABLE "lesson_call_webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" text NOT NULL,
	"event" text NOT NULL,
	"provider_recording_id" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"provider_meeting_id" text NOT NULL,
	"teacher_consent_at" timestamp with time zone,
	"student_consent_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_recording_tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recording_id" uuid NOT NULL,
	"role" "lesson_call_role" NOT NULL,
	"provider_participant_id" text NOT NULL,
	"provider_file_name" text NOT NULL,
	"storage_key" text,
	"bytes" integer,
	"sha256" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_id" uuid NOT NULL,
	"provider_recording_id" text NOT NULL,
	"state" "lesson_recording_state" DEFAULT 'recording' NOT NULL,
	"expected_track_count" integer DEFAULT 2 NOT NULL,
	"provider_expires_at" timestamp with time zone,
	"duration_seconds" integer,
	"failure_reason" text,
	"started_at" timestamp with time zone,
	"stopped_at" timestamp with time zone,
	"ingested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lesson_calls" ADD CONSTRAINT "lesson_calls_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_calls" ADD CONSTRAINT "lesson_calls_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_calls" ADD CONSTRAINT "lesson_calls_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_recording_tracks" ADD CONSTRAINT "lesson_recording_tracks_recording_id_lesson_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."lesson_recordings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_recordings" ADD CONSTRAINT "lesson_recordings_call_id_lesson_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."lesson_calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_call_webhooks_delivery_idx" ON "lesson_call_webhooks" USING btree ("delivery_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_calls_lesson_idx" ON "lesson_calls" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "lesson_calls_teacher_idx" ON "lesson_calls" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "lesson_calls_student_idx" ON "lesson_calls" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_recording_tracks_file_idx" ON "lesson_recording_tracks" USING btree ("recording_id","provider_file_name");--> statement-breakpoint
CREATE INDEX "lesson_recording_tracks_recording_idx" ON "lesson_recording_tracks" USING btree ("recording_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_recordings_provider_idx" ON "lesson_recordings" USING btree ("provider_recording_id");--> statement-breakpoint
CREATE INDEX "lesson_recordings_call_idx" ON "lesson_recordings" USING btree ("call_id");--> statement-breakpoint
CREATE INDEX "lesson_recordings_state_idx" ON "lesson_recordings" USING btree ("state");