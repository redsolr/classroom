CREATE TABLE "study_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"language" text,
	"instructions" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "study_threads" ALTER COLUMN "language" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "study_threads" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "study_projects" ADD CONSTRAINT "study_projects_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "study_projects_learner_id_idx" ON "study_projects" USING btree ("learner_id");--> statement-breakpoint
ALTER TABLE "study_threads" ADD CONSTRAINT "study_threads_project_id_study_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."study_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Backfill: language-era threads become language projects (one per
-- learner+language) so nothing goes loose on upgrade.
INSERT INTO "study_projects" ("learner_id", "name", "language")
SELECT DISTINCT "learner_id", "language", "language" FROM "study_threads" WHERE "language" IS NOT NULL;--> statement-breakpoint
UPDATE "study_threads" t SET "project_id" = p."id"
FROM "study_projects" p
WHERE t."project_id" IS NULL AND t."language" IS NOT NULL
  AND p."learner_id" = t."learner_id" AND p."language" = t."language";