CREATE TABLE "lesson_utterances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recording_id" uuid NOT NULL,
	"track_id" uuid NOT NULL,
	"role" "lesson_call_role" NOT NULL,
	"sequence" integer NOT NULL,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lesson_recording_tracks" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lesson_recording_tracks" ADD COLUMN "transcribed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lesson_recording_tracks" ADD COLUMN "transcript_model" text;--> statement-breakpoint
ALTER TABLE "lesson_utterances" ADD CONSTRAINT "lesson_utterances_recording_id_lesson_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."lesson_recordings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_utterances" ADD CONSTRAINT "lesson_utterances_track_id_lesson_recording_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."lesson_recording_tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_utterances_track_sequence_idx" ON "lesson_utterances" USING btree ("track_id","sequence");--> statement-breakpoint
CREATE INDEX "lesson_utterances_recording_idx" ON "lesson_utterances" USING btree ("recording_id");