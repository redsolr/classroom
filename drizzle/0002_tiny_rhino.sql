ALTER TABLE "homework" ADD COLUMN "submission_text" text;--> statement-breakpoint
ALTER TABLE "homework" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "portal_token" text;--> statement-breakpoint
CREATE UNIQUE INDEX "students_portal_token_idx" ON "students" USING btree ("portal_token");