CREATE TYPE "public"."study_plan_status" AS ENUM('free', 'active', 'past_due', 'canceled');--> statement-breakpoint
CREATE TABLE "learners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workos_user_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"plan_status" "study_plan_status" DEFAULT 'free' NOT NULL,
	"plan_renews_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"role" "ai_message_role" NOT NULL,
	"content" text NOT NULL,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_id" uuid NOT NULL,
	"language" text NOT NULL,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_vocab" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_id" uuid NOT NULL,
	"language" text NOT NULL,
	"term" text NOT NULL,
	"reading" text,
	"meaning" text,
	"example" text,
	"notes" text,
	"status" "vocabulary_status" DEFAULT 'new' NOT NULL,
	"srs_reps" integer DEFAULT 0 NOT NULL,
	"srs_ease_factor" real DEFAULT 2.5 NOT NULL,
	"srs_interval_days" real DEFAULT 0 NOT NULL,
	"srs_due_at" timestamp with time zone,
	"last_reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "study_messages" ADD CONSTRAINT "study_messages_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_messages" ADD CONSTRAINT "study_messages_thread_id_study_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."study_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_threads" ADD CONSTRAINT "study_threads_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_vocab" ADD CONSTRAINT "study_vocab_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "learners_workos_user_id_idx" ON "learners" USING btree ("workos_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "learners_stripe_customer_id_idx" ON "learners" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "study_messages_thread_created_idx" ON "study_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "study_messages_learner_created_idx" ON "study_messages" USING btree ("learner_id","created_at");--> statement-breakpoint
CREATE INDEX "study_threads_learner_id_idx" ON "study_threads" USING btree ("learner_id","updated_at");--> statement-breakpoint
CREATE INDEX "study_vocab_learner_language_idx" ON "study_vocab" USING btree ("learner_id","language");--> statement-breakpoint
CREATE INDEX "study_vocab_learner_due_idx" ON "study_vocab" USING btree ("learner_id","srs_due_at");