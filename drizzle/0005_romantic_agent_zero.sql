ALTER TABLE "students" ADD COLUMN "workos_user_id" text;--> statement-breakpoint
CREATE INDEX "students_workos_user_id_idx" ON "students" USING btree ("workos_user_id");