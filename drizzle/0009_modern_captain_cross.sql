CREATE TABLE "study_vocab_list_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"vocab_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_vocab_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "study_vocab" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "study_vocab_list_items" ADD CONSTRAINT "study_vocab_list_items_list_id_study_vocab_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."study_vocab_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_vocab_list_items" ADD CONSTRAINT "study_vocab_list_items_vocab_id_study_vocab_id_fk" FOREIGN KEY ("vocab_id") REFERENCES "public"."study_vocab"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_vocab_lists" ADD CONSTRAINT "study_vocab_lists_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "study_vocab_list_items_list_vocab_idx" ON "study_vocab_list_items" USING btree ("list_id","vocab_id");--> statement-breakpoint
CREATE INDEX "study_vocab_list_items_list_position_idx" ON "study_vocab_list_items" USING btree ("list_id","position");--> statement-breakpoint
CREATE INDEX "study_vocab_lists_learner_id_idx" ON "study_vocab_lists" USING btree ("learner_id");