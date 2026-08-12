ALTER TABLE "learners" ADD COLUMN "instructions" text;--> statement-breakpoint
ALTER TABLE "learners" ADD COLUMN "memory_enabled" boolean DEFAULT true NOT NULL;