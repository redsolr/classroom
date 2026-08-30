CREATE TYPE "public"."booking_plan" AS ENUM('single', 'recurring');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('pending_payment', 'confirmed', 'cancelled', 'completed');--> statement-breakpoint
CREATE TYPE "public"."path_step_kind" AS ENUM('pack', 'sentences', 'chat', 'lesson');--> statement-breakpoint
CREATE TYPE "public"."tutor_listing_status" AS ENUM('draft', 'listed', 'paused');--> statement-breakpoint
CREATE TYPE "public"."tutor_payment_status" AS ENUM('pending', 'succeeded', 'refunded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."tutor_subscription_status" AS ENUM('active', 'past_due', 'canceled');--> statement-breakpoint
CREATE TABLE "study_path_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_id" uuid NOT NULL,
	"path_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_path_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"path_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"kind" "path_step_kind" NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"pack_slug" text,
	"target" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_paths" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"language" text NOT NULL,
	"description" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tutor_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tutor_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"learner_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"lesson_id" uuid,
	"subscription_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"plan" "booking_plan" DEFAULT 'single' NOT NULL,
	"status" "booking_status" DEFAULT 'pending_payment' NOT NULL,
	"focus" text[] DEFAULT '{}'::text[] NOT NULL,
	"notes" text,
	"price_cents" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"hold_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tutor_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"learner_id" uuid NOT NULL,
	"booking_id" uuid,
	"subscription_id" uuid,
	"stripe_payment_intent_id" text,
	"stripe_charge_id" text,
	"currency" text DEFAULT 'usd' NOT NULL,
	"gross_cents" integer NOT NULL,
	"stripe_fee_cents" integer,
	"platform_fee_cents" integer NOT NULL,
	"tutor_net_cents" integer NOT NULL,
	"status" "tutor_payment_status" DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tutor_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"headline" text NOT NULL,
	"bio" text,
	"languages" text[] NOT NULL,
	"country" text,
	"timezone" text,
	"rate_cents" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"lesson_minutes" integer DEFAULT 50 NOT NULL,
	"status" "tutor_listing_status" DEFAULT 'draft' NOT NULL,
	"stripe_account_id" text,
	"payouts_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tutor_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"learner_id" uuid NOT NULL,
	"stripe_subscription_id" text,
	"status" "tutor_subscription_status" DEFAULT 'active' NOT NULL,
	"weekday" integer NOT NULL,
	"start_minute" integer NOT NULL,
	"lessons_per_month" integer DEFAULT 4 NOT NULL,
	"discount_percent" integer NOT NULL,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "study_path_enrollments" ADD CONSTRAINT "study_path_enrollments_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_path_enrollments" ADD CONSTRAINT "study_path_enrollments_path_id_study_paths_id_fk" FOREIGN KEY ("path_id") REFERENCES "public"."study_paths"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_path_steps" ADD CONSTRAINT "study_path_steps_path_id_study_paths_id_fk" FOREIGN KEY ("path_id") REFERENCES "public"."study_paths"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_availability" ADD CONSTRAINT "tutor_availability_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_bookings" ADD CONSTRAINT "tutor_bookings_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_bookings" ADD CONSTRAINT "tutor_bookings_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_bookings" ADD CONSTRAINT "tutor_bookings_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_bookings" ADD CONSTRAINT "tutor_bookings_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_bookings" ADD CONSTRAINT "tutor_bookings_subscription_id_tutor_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."tutor_subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_payments" ADD CONSTRAINT "tutor_payments_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_payments" ADD CONSTRAINT "tutor_payments_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_payments" ADD CONSTRAINT "tutor_payments_booking_id_tutor_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."tutor_bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_payments" ADD CONSTRAINT "tutor_payments_subscription_id_tutor_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."tutor_subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_profiles" ADD CONSTRAINT "tutor_profiles_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_subscriptions" ADD CONSTRAINT "tutor_subscriptions_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_subscriptions" ADD CONSTRAINT "tutor_subscriptions_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "study_path_enrollments_learner_path_idx" ON "study_path_enrollments" USING btree ("learner_id","path_id");--> statement-breakpoint
CREATE UNIQUE INDEX "study_path_steps_path_position_idx" ON "study_path_steps" USING btree ("path_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "study_paths_slug_idx" ON "study_paths" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "tutor_availability_teacher_idx" ON "tutor_availability" USING btree ("teacher_id","weekday");--> statement-breakpoint
CREATE INDEX "tutor_bookings_teacher_start_idx" ON "tutor_bookings" USING btree ("teacher_id","starts_at");--> statement-breakpoint
CREATE INDEX "tutor_bookings_learner_start_idx" ON "tutor_bookings" USING btree ("learner_id","starts_at");--> statement-breakpoint
CREATE INDEX "tutor_bookings_student_idx" ON "tutor_bookings" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "tutor_payments_teacher_idx" ON "tutor_payments" USING btree ("teacher_id","created_at");--> statement-breakpoint
CREATE INDEX "tutor_payments_learner_idx" ON "tutor_payments" USING btree ("learner_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tutor_payments_intent_idx" ON "tutor_payments" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tutor_profiles_teacher_id_idx" ON "tutor_profiles" USING btree ("teacher_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tutor_profiles_stripe_account_idx" ON "tutor_profiles" USING btree ("stripe_account_id");--> statement-breakpoint
CREATE INDEX "tutor_profiles_status_idx" ON "tutor_profiles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tutor_subscriptions_learner_idx" ON "tutor_subscriptions" USING btree ("learner_id");--> statement-breakpoint
CREATE INDEX "tutor_subscriptions_teacher_idx" ON "tutor_subscriptions" USING btree ("teacher_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tutor_subscriptions_stripe_id_idx" ON "tutor_subscriptions" USING btree ("stripe_subscription_id");